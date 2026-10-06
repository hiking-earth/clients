import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const [metadataFile,directory,output,sourceCommit]=process.argv.slice(2);
if(!metadataFile||!directory||!output||!/^[a-f0-9]{40}$/.test(sourceCommit||''))throw new Error('Usage: metadata.json artifacts output.json source-commit');
const release=JSON.parse(readFileSync(metadataFile,'utf8'));
const config=JSON.parse(readFileSync(new URL('../desktop/src-tauri/tauri.conf.json',import.meta.url),'utf8'));
if(release.draft!==true||release.target_commitish!==sourceCommit||!Array.isArray(release.assets))throw new Error('Expected draft release pinned to source commit');
const platforms={};
for(const [platform,suffix] of [['windows-x86_64','.msi'],['darwin-aarch64','.app.tar.gz'],['linux-x86_64','.AppImage']]){
 const candidates=release.assets.filter(a=>typeof a.name==='string'&&a.name.endsWith(suffix));
 if(candidates.length!==1)throw new Error(`Expected one ${platform} update artifact`);
 const artifact=candidates[0],signature=release.assets.find(a=>a.name===artifact.name+'.sig');
 if(!signature)throw new Error(`Missing ${platform} signature`);
 for(const item of [artifact,signature]){
  if(path.basename(item.name)!==item.name)throw new Error('Invalid artifact filename');
  const bytes=readFileSync(path.join(directory,item.name));
  if(bytes.length!==item.size||item.digest!=='sha256:'+createHash('sha256').update(bytes).digest('hex'))throw new Error('Remote and local artifact digest differ');
 }
 const verification=spawnSync(process.execPath,[fileURLToPath(new URL('./verify-desktop-updater.mjs',import.meta.url)),path.join(directory,artifact.name)],{encoding:'utf8'});
 if(verification.status!==0)throw new Error(`Invalid ${platform} signature`);
 if(typeof artifact.browser_download_url!=='string'||!artifact.browser_download_url.startsWith('https://github.com/hiking-earth/clients/releases/download/'))throw new Error('Unexpected updater origin');
 platforms[platform]={url:artifact.browser_download_url,signature:readFileSync(path.join(directory,signature.name),'utf8').trim()};
}
writeFileSync(output,JSON.stringify({version:config.version,notes:'Candidate; full platform acceptance required before public release.',pub_date:release.created_at,platforms},null,2)+'\n');
console.log('Prepared verified three-platform updater manifest; release remains draft.');
