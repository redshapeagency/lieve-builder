/** Deterministic installable ZIP, with one inventory policy and independent verification. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'release/manifest.json')));
const identity = 'https://github.com/redshapeagency/lieve-builder', limit = 104857600;
const fail = message => { throw Error(message); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const stable = value => typeof value === 'string' && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value);
const headers = css => Object.fromEntries(['Theme Name','Version','Requires at least','Requires PHP','Update URI','Text Domain','Template'].map(key => [key, css.match(new RegExp('^[ \\t/*#@]*'+key+':[ \\t]*(.*)$','mi'))?.[1].replace(/\s*\*\/.*/, '').trim() || '']));
const theme = headers(fs.readFileSync(path.join(root, 'style.css'), 'utf8')), version = theme.Version;
const runtimeVersion = bytes => bytes.toString().match(/define\s*\(\s*['"]LIEVE_VERSION['"]\s*,\s*['"]([^'"]+)['"]\s*\)/)?.[1];
if (policy.theme !== 'lieve-builder' || !stable(version) || theme['Theme Name'] !== 'Lieve Builder' || theme['Update URI'] !== identity || theme['Text Domain'] !== policy.theme || theme.Template || runtimeVersion(fs.readFileSync(path.join(root, 'functions.php'))) !== version) fail('Invalid theme identity or inconsistent runtime/stylesheet version.');
for (const key of ['Requires at least','Requires PHP']) if (!/^\d+(?:\.\d+){1,3}$/.test(theme[key])) fail('Invalid release requirements.');
const readme=fs.readFileSync(path.join(root,'readme.txt'),'utf8');
if (readme.match(/^Stable tag: (.+)$/m)?.[1].trim() !== version) fail('WordPress readme version differs from the theme.');
for (const key of ['Requires at least','Requires PHP']) if (readme.match(new RegExp('^'+key+': (.+)$','m'))?.[1].trim() !== theme[key]) fail('WordPress readme requirements differ from the theme.');
for (const file of ['package.json','package-lock.json']) if (fs.existsSync(path.join(root,file)) && JSON.parse(fs.readFileSync(path.join(root,file),'utf8')).version !== version) fail('Development package metadata differs from the theme version.');
const tagIndex = process.argv.indexOf('--tag');
if (tagIndex !== -1 && ![version, 'v'+version].includes(process.argv[tagIndex+1])) fail('Release tag must match the theme version.');
for (const key of ['files','directories','extensions','excludedNames','excludedSuffixes']) if (!Array.isArray(policy[key]) || !policy[key].length || !policy[key].every(value => typeof value === 'string' && value)) fail('Invalid release inventory policy: '+key);
const excluded = name => name.startsWith('.') || policy.excludedNames.includes(name.toLowerCase()) || policy.excludedSuffixes.some(suffix => name.toLowerCase().endsWith(suffix));
const safe = file => typeof file === 'string' && file.length <= 1024 && !/[\x00-\x1f\x7f\\:]/.test(file) && file.split('/').every(part => part && part !== '..' && !excluded(part));
const sources = new Map();
const foldedPaths = new Map();
let directoryCount=1;
function collect(file, directory = false, depth = 0) {
  if (!safe(file) || depth > 20) fail('Unsafe release path: '+file);
  const folded=file.toLowerCase();
  if (foldedPaths.has(folded) && foldedPaths.get(folded)!==file) fail('Case-colliding release path: '+file);
  foldedPaths.set(folded,file);
  const stat = fs.lstatSync(path.join(root, file));
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) fail('Missing, linked or invalid release path: '+file);
  if (directory) {
    if (++directoryCount > 5000) fail('Release exceeds the directory limit.');
    for (const item of fs.readdirSync(path.join(root, file)).sort()) {
      if (excluded(item)) continue;
      const child = file+'/'+item, info = fs.lstatSync(path.join(root, child));
      collect(child, info.isDirectory(), depth+1);
    }
  } else {
    if (!policy.extensions.includes(path.extname(file).toLowerCase()) || sources.has(file)) fail('Unlisted or duplicate release file: '+file);
    if (stat.size > limit || sources.size >= 5000) fail('Release exceeds size/file limits.');
    sources.set(file, fs.readFileSync(path.join(root, file)));
  }
}
policy.files.forEach(file => collect(file)); policy.directories.forEach(file => collect(file, true, 1));
const files = [...sources.keys()].sort(), bytes = [...sources.values()].reduce((n, data) => n+data.length, 0);
if (bytes > limit || files.some(file => /(?:^|\/)(?:gsap|ScrollTrigger)(?:[./-]|$)/i.test(file))) fail('Release contains an unsupported dependency or exceeds the size limit.');
for (const required of ['style.css','functions.php','inc/bootstrap.php','inc/core/theme-updates.php','inc/core/theme-update-package.php','assets/vendor/animejs/LICENSE.md','assets/vendor/animejs/NOTICE.md']) if (!sources.has(required)) fail('Missing required runtime file or dependency notice: '+required);
if (process.argv.includes('--check')) { console.log(JSON.stringify({version,files:files.length,bytes,distribution:'requires release acceptance; Anime.js MIT notices included'},null,2)); process.exit(0); }

const crc32 = buffer => { let crc=0xffffffff; for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);} return (crc^0xffffffff)>>>0; };
/** Parse central AND local records; reject extra roots, duplicate paths and trailing data. */
function verify(archive, filename, development = false) {
  if (filename !== (development?'lieve-builder-DEVELOPMENT-DO-NOT-DISTRIBUTE.zip':'lieve-builder.zip')) fail('Noncanonical package filename.');
  if (archive.length < 22 || archive.length > limit) fail('Invalid package size.');
  const expected = new Map(files.map(file => [file, sources.get(file)]));
  if (development) expected.set('DEVELOPMENT-ONLY.txt', Buffer.from('LOCAL DEVELOPMENT ONLY. NOT CLEARED FOR DISTRIBUTION. Release acceptance gates are pending.\n'));
  const inventory = new Map([...expected].map(([file, data])=>[file,{size:data.length,sha256:hash(data)}]));
  const end = archive.length-22;
  if (archive.readUInt32LE(end) !== 0x06054b50 || archive.readUInt16LE(end+4) || archive.readUInt16LE(end+6) || archive.readUInt16LE(end+20)) fail('Invalid ZIP end record.');
  const count = archive.readUInt16LE(end+10), start = archive.readUInt32LE(end+16), length = archive.readUInt32LE(end+12);
  if (count !== expected.size || archive.readUInt16LE(end+8) !== count || start+length !== end) fail('Invalid ZIP central directory.');
  let cursor=start, local=0; const seen = new Set();
  for (let i=0;i<count;i++) {
    if (cursor+46 > end || archive.readUInt32LE(cursor) !== 0x02014b50) fail('Invalid ZIP directory entry.');
    const nameLength=archive.readUInt16LE(cursor+28), name=archive.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
    const size=archive.readUInt32LE(cursor+20), expanded=archive.readUInt32LE(cursor+24), crc=archive.readUInt32LE(cursor+16), offset=archive.readUInt32LE(cursor+42);
    const file=name.slice(policy.theme.length+1), item=inventory.get(file);
    if (!name.startsWith(policy.theme+'/') || !item || seen.has(file) || archive.readUInt16LE(cursor+8) !== 0x800 || archive.readUInt16LE(cursor+10) !== 8 || archive.readUInt16LE(cursor+30) || archive.readUInt16LE(cursor+32) || archive.readUInt16LE(cursor+34) || archive.readUInt32LE(cursor+38) !== 0x81a40000 || expanded !== item.size || offset !== local || local+30+nameLength+size > start) fail('Unsafe ZIP path, metadata or file bounds.');
    if (archive.readUInt32LE(local) !== 0x04034b50 || archive.readUInt16LE(local+6) !== 0x800 || archive.readUInt16LE(local+8) !== 8 || archive.readUInt32LE(local+14) !== crc || archive.readUInt32LE(local+18) !== size || archive.readUInt32LE(local+22) !== expanded || archive.readUInt16LE(local+26) !== nameLength || archive.readUInt16LE(local+28) || archive.subarray(local+30,local+30+nameLength).toString('utf8') !== name) fail('ZIP local/central records disagree.');
    const content=zlib.inflateRawSync(archive.subarray(local+30+nameLength,local+30+nameLength+size),{maxOutputLength:Math.max(1,expanded)});
    if (content.length !== expanded || crc32(content) !== crc || hash(content) !== item.sha256) fail('ZIP content failed CRC/SHA-256 verification.');
    seen.add(file); cursor+=46+nameLength; local+=30+nameLength+size;
  }
  if (cursor !== end || local !== start) fail('ZIP has unaccounted records.');
}
const verifyIndex=process.argv.indexOf('--verify');
if (verifyIndex !== -1) {
  const target=process.argv[verifyIndex+1]; if (!target) fail('Supply a ZIP to --verify.');
  verify(fs.readFileSync(target),path.basename(target),process.argv.includes('--development'));
  console.log('Verified ZIP, root, source inventory, headers, CRC and SHA-256 (no sidecar).'); process.exit(0);
}
const development=process.argv.includes('--development');
if (!development && process.env.LIEVE_RELEASE_ACCEPTED !== 'true') fail('DISTRIBUTION BLOCKED: release acceptance is not confirmed. Complete native, browser and target-host checks before setting LIEVE_RELEASE_ACCEPTED=true.');
const entries=files.map(file=>({file,data:sources.get(file)}));
if (development) entries.push({file:'DEVELOPMENT-ONLY.txt',data:Buffer.from('LOCAL DEVELOPMENT ONLY. NOT CLEARED FOR DISTRIBUTION. Release acceptance gates are pending.\n')});
const chunks=[],central=[]; let offset=0;
for (const entry of entries) {
  const name=Buffer.from(policy.theme+'/'+entry.file),data=zlib.deflateRawSync(entry.data,{level:9}),crc=crc32(entry.data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(entry.data.length,22);local.writeUInt16LE(name.length,26);
  chunks.push(local,name,data);
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(0x314,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(33,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(entry.data.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(0x81a40000,38);directory.writeUInt32LE(offset,42);central.push(directory,name);offset+=local.length+name.length+data.length;
}
const centralData=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralData.length,12);end.writeUInt32LE(offset,16);
const filename=development?'lieve-builder-DEVELOPMENT-DO-NOT-DISTRIBUTE.zip':'lieve-builder.zip';
const archive=Buffer.concat([...chunks,centralData,end]);
verify(archive,filename,development);
const output=path.resolve(process.env.LIEVE_PACKAGE_DIR || '/tmp');fs.mkdirSync(output,{recursive:true});
const target=path.join(output,filename);
// Never overwrite a different artifact; no external manifest is generated.
if (fs.existsSync(target)) {
  if (!fs.lstatSync(target).isFile() || !archive.equals(fs.readFileSync(target))) fail('Conflicting existing package; use a clean output directory.');
} else {
  const stage=fs.mkdtempSync(path.join(output,'.lieve-package-'));
  try {
    fs.writeFileSync(path.join(stage,filename),archive,{flag:'wx'});
    fs.linkSync(path.join(stage,filename),target);
  }
  finally { fs.rmSync(stage,{recursive:true,force:true}); }
}
console.log(target);
