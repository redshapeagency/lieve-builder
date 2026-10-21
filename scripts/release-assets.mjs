/** Attach a verified pair; never clobber, and roll back only assets created by this job. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function attachReleaseAssets({tag, directory, repo, call}) {
  if (repo !== 'redshapeagency/lieve-builder' || !/^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag)) throw Error('Expected the official repository and a stable version tag.');
  const version=tag.replace(/^v/,''), name='lieve-builder-'+version+'.zip';
  const files=[name,name+'.manifest.json'].map(name=>({name,file:path.join(directory,name)}));
  const json = args => JSON.parse(call(args).toString());
  const api = 'repos/'+repo+'/releases';
  let release;
  try { release=json(['api',api+'/tags/'+tag]); }
  catch (error) {
    if (!/HTTP 404/.test(String(error.stderr || ''))) throw Error('Cannot read the release; no assets were changed.');
    const ref=json(['api','repos/'+repo+'/git/ref/tags/'+tag]);
    if (!/^[a-f0-9]{40,64}$/.test(ref.object?.sha || '')) throw Error('The release tag must already exist on GitHub.');
    release=json(['api',api,'--method','POST','-f','tag_name='+tag,'-f','name='+tag,'-F','draft=true','-f','body=WordPress update package. Review both assets before publishing.']);
  }
  if (!Number.isSafeInteger(release.id) || release.id <= 0 || release.tag_name !== tag || release.prerelease !== false || typeof release.draft !== 'boolean' || !Array.isArray(release.assets)) throw Error('Unexpected release identity or prerelease; nothing uploaded.');
  const existing=release.assets.filter(asset=>files.some(file=>file.name===asset.name));
  if (existing.length) {
    if (existing.length !== 2 || files.some(file=>existing.filter(asset=>asset.name===file.name && asset.state==='uploaded' && Number.isSafeInteger(asset.id)).length !== 1)) throw Error('Release has a partial or ambiguous asset pair. Review it manually; existing assets are never deleted or overwritten.');
    for (const file of files) {
      const asset=existing.find(asset=>asset.name===file.name);
      const bytes=call(['api',api+'/assets/'+asset.id,'-H','Accept: application/octet-stream']);
      if (!Buffer.from(bytes).equals(fs.readFileSync(file.file))) throw Error('Existing release assets differ from the verified build. Publish a new version; nothing was overwritten.');
    }
    return 'Identical verified assets are already attached; no changes.';
  }
  if (release.immutable) throw Error('This release is immutable. Prepare assets on a draft before publishing a new release.');
  const uploadBase='https://uploads.github.com/'+api+'/'+release.id+'/assets';
  if (release.upload_url !== uploadBase+'{?name,label}') throw Error('The release upload URL could not be verified. Nothing uploaded.');
  const created=[];
  try {
    // ZIP first, manifest last: clients cannot offer an incomplete pair.
    for (const file of files) {
      const size=fs.statSync(file.file).size;
      const asset=json(['api',release.upload_url.replace('{?name,label}','?name='+encodeURIComponent(file.name)),'--method','POST','-H','Content-Type: '+(file.name.endsWith('.json')?'application/json':'application/zip'),'-H','Content-Length: '+size,'--input',file.file]);
      if (!Number.isSafeInteger(asset.id) || asset.id <= 0) throw Error('Upload response did not return an asset ID; inspect the draft manually.');
      created.push(asset.id);
      const digest='sha256:'+crypto.createHash('sha256').update(fs.readFileSync(file.file)).digest('hex');
      if (asset.name !== file.name || asset.state !== 'uploaded' || asset.size !== size || (asset.digest != null && asset.digest !== digest)) throw Error('An uploaded asset failed identity, size or digest verification.');
    }
    return 'Verified ZIP and manifest attached. GitHub source archives were not modified.';
  } catch (error) {
    let cleanup=true;
    for (const id of created.reverse()) { try { call(['api',api+'/assets/'+id,'--method','DELETE']); } catch { cleanup=false; } }
    throw Error(cleanup ? 'Asset publication failed. Assets with confirmed IDs from this job were removed. Inspect the release for an interrupted upload before retrying.' : 'Asset publication failed and rollback was incomplete. Inspect this release manually before publishing.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.LIEVE_RELEASE_ACCEPTED !== 'true') throw Error('Release acceptance is required.');
    const directory=process.env.LIEVE_PACKAGE_DIR, tag=process.env.RELEASE_TAG;
    if (!directory || !tag) throw Error('Missing release directory or tag.');
    const filename=path.join(directory,'lieve-builder-'+tag.replace(/^v/,'')+'.zip');
    execFileSync(process.execPath,['scripts/package.mjs','--verify',filename,'--tag',tag],{stdio:'pipe'});
    const metadata=JSON.parse(fs.readFileSync(filename+'.manifest.json','utf8'));
    if (metadata.development !== false) throw Error('Development packages cannot be published.');
    const call=args=>execFileSync('gh',args,{encoding:null,maxBuffer:110*1024*1024,stdio:['ignore','pipe','pipe'],timeout:120000});
    console.log(attachReleaseAssets({tag,directory,repo:process.env.GITHUB_REPOSITORY,call}));
  } catch (error) {
    // Do not print HTTP bodies, subprocess arguments, tokens or environment values.
    console.error(error instanceof Error && error.message && !error.message.startsWith('Command failed:') ? error.message : 'Release preparation failed. Review configuration and retry.');
    process.exitCode=1;
  }
}
