/** Publish only lieve-builder.zip. Never overwrite or remove preexisting assets. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const migrationNotice='Legacy updater migration: installations expecting versioned ZIPs and an external manifest need a one-time manual theme update using lieve-builder.zip. Automatic updates resume after installing this updater. Back up first; do not rename the active theme folder.';
const digest=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
export function attachReleaseAssets({tag,directory,repo,call}) {
  if(repo!=='redshapeagency/lieve-builder'||!/^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag))throw Error('Expected the official repository and a stable version tag.');
  const name='lieve-builder.zip',file=path.join(directory,name),bytes=fs.readFileSync(file),expected=digest(bytes),api='repos/'+repo+'/releases',downloadUrl='https://github.com/'+repo+'/releases/download/'+tag+'/'+name;
  const json=args=>JSON.parse(call(args).toString());let release;
  try{release=json(['api',api+'/tags/'+tag]);}catch(error){
    if(!/HTTP 404/.test(String(error.stderr||'')))throw Error('Cannot read the release; nothing changed.');
    const ref=json(['api','repos/'+repo+'/git/ref/tags/'+tag]);if(!/^[a-f0-9]{40,64}$/.test(ref.object?.sha||''))throw Error('The release tag must already exist.');
    release=json(['api',api,'--method','POST','-f','tag_name='+tag,'-f','name='+tag,'-F','draft=true','-f','body='+migrationNotice]);
  }
  if(!release||!Number.isSafeInteger(release.id)||release.id<=0||release.tag_name!==tag||release.prerelease!==false||typeof release.draft!=='boolean'||!Array.isArray(release.assets))throw Error('Invalid release identity or prerelease. Nothing uploaded.');
  // GitHub's Source code archives are not custom assets; leave them untouched.
  if(release.assets.length>1||release.assets.some(asset=>!asset||asset.name!==name))throw Error('Release contains other custom assets. Exactly lieve-builder.zip is allowed. Existing assets were not removed; prepare a new release.');
  if(typeof release.body!=='string'||!release.body.includes(migrationNotice))throw Error('Release notes must explicitly include the documented legacy updater migration notice before publishing this asset.');
  if(release.assets.length){
    const asset=release.assets[0];
    if(!Number.isSafeInteger(asset.id)||asset.id<=0||asset.state!=='uploaded'||asset.browser_download_url!==downloadUrl||asset.size!==bytes.length||asset.digest!==expected)throw Error('Existing asset has a missing/invalid digest or differs from this build. Nothing overwritten.');
    if(!Buffer.from(call(['api',api+'/assets/'+asset.id,'-H','Accept: application/octet-stream'])).equals(bytes))throw Error('Existing asset content differs. Nothing overwritten.');
    return 'Identical lieve-builder.zip and GitHub SHA-256 digest already verified; no changes.';
  }
  if(release.immutable)throw Error('Prepare the asset on a draft before publishing an immutable release.');
  const uploadBase='https://uploads.github.com/'+api+'/'+release.id+'/assets';
  if(release.upload_url!==uploadBase+'{?name,label}')throw Error('Unverified release upload URL. Nothing uploaded.');
  let created;
  try{
    const asset=json(['api',release.upload_url.replace('{?name,label}','?name='+name),'--method','POST','-H','Content-Type: application/zip','-H','Content-Length: '+bytes.length,'--input',file]);
    if(!Number.isSafeInteger(asset.id)||asset.id<=0)throw Error('Upload outcome is unconfirmed.');created=asset.id;
    if(asset.name!==name||asset.state!=='uploaded'||asset.browser_download_url!==downloadUrl||asset.size!==bytes.length||asset.digest!==expected)throw Error('Upload digest/identity verification failed.');
    const confirmed=json(['api',api+'/tags/'+tag]);
    if(confirmed.id!==release.id||confirmed.assets?.length!==1||confirmed.assets[0].id!==created||confirmed.assets[0].name!==name||confirmed.assets[0].state!=='uploaded'||confirmed.assets[0].browser_download_url!==downloadUrl||confirmed.assets[0].size!==bytes.length||confirmed.assets[0].digest!==expected)throw Error('Release is not the expected single verified asset.');
    return 'Attached exactly lieve-builder.zip; GitHub SHA-256 verified. No external manifest or source archive uploaded.';
  }catch(error){
    if(created){try{call(['api',api+'/assets/'+created,'--method','DELETE']);}catch{throw Error('Asset publication failed and cleanup failed. Inspect the draft before publishing.');}}
    throw Error('Asset publication failed. Any confirmed asset created by this job was removed. Inspect the draft for an interrupted upload before retrying.');
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.env.LIEVE_RELEASE_ACCEPTED!=='true')throw Error('Release acceptance is required.');
    const directory=process.env.LIEVE_PACKAGE_DIR,tag=process.env.RELEASE_TAG;if(!directory||!tag)throw Error('Missing release directory or tag.');
    execFileSync(process.execPath,['scripts/package.mjs','--verify',path.join(directory,'lieve-builder.zip'),'--tag',tag],{stdio:'pipe'});
    const call=args=>execFileSync('gh',args,{encoding:null,maxBuffer:110*1024*1024,stdio:['ignore','pipe','pipe'],timeout:120000});
    console.warn('::warning::'+migrationNotice);
    console.log(attachReleaseAssets({tag,directory,repo:process.env.GITHUB_REPOSITORY,call}));
  }catch(error){console.error(error instanceof Error&&!error.message.startsWith('Command failed:')?error.message:'Release preparation failed. Check configuration and retry.');process.exitCode=1;}
}
