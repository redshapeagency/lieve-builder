/** Deterministic whitelist ZIP. Distribution is blocked without product-specific authorization. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release/manifest.json')));
const stylesheet = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const header = name => stylesheet.match(new RegExp('^'+name+':\\s*(.+)$','m'))?.[1].trim() || '';
const version = header('Version');
const tagIndex = process.argv.indexOf('--tag');
if (tagIndex !== -1 && ![version, 'v'+version].includes(process.argv[tagIndex+1])) throw Error('Release tag must match the theme version.');
if (header('Update URI') !== 'https://github.com/redshapeagency/lieve-builder') throw Error('Unexpected theme update identity.');
if (fs.readFileSync(path.join(root,'functions.php'),'utf8').match(/define\( 'LIEVE_VERSION', '([^']+)' \)/)?.[1] !== version) throw Error('Runtime and stylesheet versions differ.');
if (!/^[a-z0-9-]+$/.test(manifest.theme) || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw Error('Invalid theme slug or release version.');
const files = [...manifest.files];
function collect(dir) {
  for (const item of fs.readdirSync(path.join(root, dir), {withFileTypes:true})) {
    if (item.name.startsWith('.')) continue;
    const name = dir + '/' + item.name;
    if (item.isSymbolicLink()) throw Error('Symlinks cannot enter a release: ' + name);
    if (item.isDirectory()) collect(name);
    else if (manifest.extensions.includes(path.extname(item.name).toLowerCase())) files.push(name);
    else throw Error('Unlisted asset type: ' + name);
  }
}
manifest.directories.forEach(collect); files.sort();
for (const file of files) { if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || !fs.lstatSync(path.join(root,file)).isFile()) throw Error('Missing or unsafe release file: ' + file); }
const inventory = files.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}));
if (process.argv.includes('--check')) { console.log(JSON.stringify({version,files:files.length,bytes:files.reduce((n,file)=>n+fs.statSync(path.join(root,file)).size,0),distribution:'blocked until product-specific GSAP authorization is reviewed'},null,2)); process.exit(0); }
const development = process.argv.includes('--development');
if (!development) {
  const evidencePath = process.env.LIEVE_GSAP_AUTHORIZATION;
  if (!evidencePath || !fs.existsSync(evidencePath)) throw Error('DISTRIBUTION BLOCKED: reviewed, product-specific GSAP authorization is required. Local development remains available.');
  const evidence = JSON.parse(fs.readFileSync(evidencePath,'utf8'));
  if (evidence.product !== 'Lieve Builder' || evidence.engine !== 'GSAP' || evidence.approved !== true || !evidence.reference || !evidence.reviewedBy || !/^\d{4}-\d{2}-\d{2}$/.test(evidence.reviewedAt || '')) throw Error('DISTRIBUTION BLOCKED: incomplete authorization review record.');
}
// ZIP32, stable paths/order/timestamps/permissions; no workstation metadata.
const crc32 = buffer => { let crc=0xffffffff; for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);} return (crc^0xffffffff)>>>0; };
const entries = files.map(file=>({name:manifest.theme+'/'+file,data:fs.readFileSync(path.join(root,file))}));
if (development) entries.push({name:manifest.theme+'/DEVELOPMENT-ONLY.txt',data:Buffer.from('LOCAL DEVELOPMENT ONLY. NOT CLEARED FOR DISTRIBUTION. GSAP product-specific authorization and release acceptance gates are pending.\n')});
const chunks=[],central=[];let offset=0;
for(const entry of entries){
  const name=Buffer.from(entry.name),data=zlib.deflateRawSync(entry.data,{level:9}),crc=crc32(entry.data);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(entry.data.length,22);header.writeUInt16LE(name.length,26);
  chunks.push(header,name,data);
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(0x314,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(33,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(entry.data.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(0x81a40000,38);directory.writeUInt32LE(offset,42);central.push(directory,name);offset+=header.length+name.length+data.length;
}
const centralData=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralData.length,12);end.writeUInt32LE(offset,16);
const target=path.resolve(process.env.LIEVE_PACKAGE_DIR || '/tmp',manifest.theme+'-'+version+(development?'-DEVELOPMENT-DO-NOT-DISTRIBUTE':'')+'.zip');
const archive=Buffer.concat([...chunks,centralData,end]);fs.writeFileSync(target,archive);fs.writeFileSync(target+'.manifest.json',JSON.stringify({theme:manifest.theme,version,development,requires:header('Requires at least'),requires_php:header('Requires PHP'),update_uri:header('Update URI'),sha256:crypto.createHash('sha256').update(archive).digest('hex'),files:inventory},null,2)+'\n');console.log(target);
