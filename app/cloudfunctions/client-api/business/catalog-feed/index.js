// Public records only: fixed upstream paths and bounded, hash-checked pages.
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const BASE='https://raw.githubusercontent.com/hiking-earth/clients/main/shared/';
const catalogs=new Set(['osm','usfs','hk','news']);
const directPaths={release:'releases/stable.json','offline-hk':'data/offline/hk-afcd.json'};
const PAGE_SIZE=400,MAX_RECORDS=250000,HEX=/^[a-f0-9]{64}$/;
const manifests=new Map(),pages=new Map(),indexes=new Map(),directCache=new Map(),pending=new Map();
let pageBytes=0,indexBytes=0;
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const SAFE_ERROR_CODES=new Set(['ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ENOENT','EACCES','AbortError','TimeoutError','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET']);
async function single(key,job){
 if(pending.has(key))return pending.get(key);
 const task=job();pending.set(key,task);try{return await task;}finally{pending.delete(key);}
}
async function download(relative,budget){
 const response=await fetch(BASE+relative,{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Upstream unavailable');
 const length=Number(response.headers.get('content-length'));if(length>budget)throw new Error('Response exceeds size budget');
 let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>budget)throw new Error('Response exceeds size budget');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
function validateManifest(value,source,version){
 const key=source==='news'?'items':'routes';
 if(value?.schemaVersion!==1||value.key!==key||value.pageSize!==PAGE_SIZE||!HEX.test(value.snapshot)||version&&value.snapshot!==version||!Number.isInteger(value.total)||value.total<0||value.total>MAX_RECORDS||!Array.isArray(value.pages)||value.pages.length!==Math.max(1,Math.ceil(value.total/PAGE_SIZE))||!HEX.test(value.indexHash)||!value.pages.every(item=>typeof item==='string'&&HEX.test(item))||value.metadata?.schemaVersion!==1||!Number.isFinite(Date.parse(value.metadata?.generatedAt)))throw new Error('Manifest invalid');
 return value;
}
async function manifest(source,version){
 const cacheKey=source+':'+(version||'current'),cached=manifests.get(cacheKey);
 if(cached&&Date.now()-cached.checkedAt<3600000)return cached;
 return single('manifest:'+cacheKey,async()=>{
  const relative=source+'/'+(version?version+'/':'')+'manifest.json';
  let local;try{local=validateManifest(JSON.parse(fs.readFileSync(path.join(__dirname,'snapshots',relative),'utf8')),source,version);}catch{}
  let data=cached?.data||local,upstreamAvailable=false;
  try{
   const incoming=validateManifest(JSON.parse((await download('public-catalog/'+relative,1024*1024)).toString('utf8')),source,version);
   if(!data||version||Date.parse(incoming.metadata.generatedAt)>=Date.parse(data.metadata.generatedAt)){data=incoming;upstreamAvailable=true;}
  }catch{}
  if(!data)throw new Error('Catalog manifest unavailable');
  const result={data,upstreamAvailable,checkedAt:Date.now()};manifests.delete(cacheKey);manifests.set(cacheKey,result);
  // Keep manifest memory bounded even with arbitrary valid-looking versions.
  while(manifests.size>16)manifests.delete(manifests.keys().next().value);
  return result;
 });
}
async function pageRows(source,manifestResult,page){
 const data=manifestResult.data,cacheKey=source+':'+data.snapshot+':'+page;
 if(pages.has(cacheKey)){const cached=pages.get(cacheKey);pages.delete(cacheKey);pages.set(cacheKey,cached);return cached;}
 return single('page:'+cacheKey,async()=>{
  const relative=source+'/'+data.snapshot+'/page-'+String(page).padStart(5,'0')+'.json.gz';
  let compressed,upstreamAvailable=false;
  try{compressed=await download('public-catalog/'+relative,2*1024*1024);upstreamAvailable=true;}catch{compressed=fs.readFileSync(path.join(__dirname,'snapshots',relative));}
  const payload=zlib.gunzipSync(compressed,{maxOutputLength:4*1024*1024});
  if(hash(payload)!==data.pages[page])throw new Error('Catalog page integrity mismatch');
  const rows=JSON.parse(payload.toString('utf8'));
  const expected=Math.max(0,Math.min(PAGE_SIZE,data.total-page*PAGE_SIZE));
  if(!Array.isArray(rows)||rows.length!==expected)throw new Error('Catalog page length invalid');
  const result={rows,upstreamAvailable,bytes:payload.length};pages.set(cacheKey,result);pageBytes+=result.bytes;
  while(pages.size>32||pageBytes>16*1024*1024){const oldest=pages.keys().next().value;pageBytes-=pages.get(oldest).bytes;pages.delete(oldest);}
  return result;
 });
}
function normalize(value){return value.normalize('NFKC').toLowerCase().trim();}
async function searchRows(source,result,query,offset){
 const data=result.data,cacheKey=source+':'+data.snapshot;
 let index=indexes.get(cacheKey);
 if(!index)index=await single('index:'+cacheKey,async()=>{
  const relative=source+'/'+data.snapshot+'/index.json.gz';let compressed;
  try{compressed=await download('public-catalog/'+relative,8*1024*1024);}catch{compressed=fs.readFileSync(path.join(__dirname,'snapshots',relative));}
  const payload=zlib.gunzipSync(compressed,{maxOutputLength:32*1024*1024});
  if(hash(payload)!==data.indexHash)throw new Error('Search index integrity mismatch');
  const rows=JSON.parse(payload.toString('utf8'));
  if(!Array.isArray(rows)||rows.length!==data.total||!rows.every(row=>Array.isArray(row)&&row.length===4&&typeof row[0]==='string'&&typeof row[1]==='string'&&Number.isInteger(row[2])&&Number.isInteger(row[3])&&row[2]>=0&&row[2]<data.pages.length&&row[3]>=0&&row[3]<PAGE_SIZE))throw new Error('Search index invalid');
  const value={rows,bytes:payload.length};indexes.set(cacheKey,value);indexBytes+=value.bytes;
  while(indexes.size>3||indexBytes>16*1024*1024){const oldest=indexes.keys().next().value;indexBytes-=indexes.get(oldest).bytes;indexes.delete(oldest);}
  return value;
 });
 const terms=normalize(query).split(/\s+/);const matches=[];let total=0;
 for(const row of index.rows){const hay=normalize(row[0]+' '+row[1]);if(terms.every(term=>hay.includes(term))){if(total>=offset&&matches.length<20)matches.push(row);total++;}}
 const found=new Map(),needed=[...new Set(matches.map(row=>row[2]))];for(let start=0;start<needed.length;start+=4){const batch=needed.slice(start,start+4);const values=await Promise.all(batch.map(page=>pageRows(source,result,page)));for(let i=0;i<batch.length;i++)found.set(batch[i],values[i].rows);}
 return {snapshot:data.snapshot,key:data.key,metadata:data.metadata,items:matches.map(row=>found.get(row[2])[row[3]]),total,offset,hasMore:offset+matches.length<total};
}
async function directSnapshot(source){
 const cached=directCache.get(source);if(cached&&Date.now()-cached.checkedAt<3600000)return cached;
 return single('direct:'+source,async()=>{
  let data=cached?.data||JSON.parse(fs.readFileSync(path.join(__dirname,'snapshots',source+'.json'),'utf8')),upstreamAvailable=false;
  try{
   const incoming=JSON.parse((await download(directPaths[source],16*1024*1024)).toString('utf8'));
   if(source==='release'){if(incoming.schemaVersion!==1||typeof incoming.ready!=='boolean')throw new Error('Release format invalid');}
   else if(incoming.format!=='hiking-earth-offline-v1'||!Array.isArray(incoming.geometry?.features))throw new Error('Offline format invalid');
   data=incoming;upstreamAvailable=true;
  }catch{}
  const result={data,snapshot:hash(JSON.stringify(data)),checkedAt:Date.now(),upstreamAvailable};directCache.set(source,result);return result;
 });
}
exports.main=async event=>{
 let stage='manifest';
 if(!event||!catalogs.has(event.source)&&!Object.hasOwn(directPaths,event.source))return {errMsg:'资料源无效'};
 try{
  if(Object.hasOwn(directPaths,event.source)){stage='direct';return await directSnapshot(event.source);}
  if(event.action==='search'){
   if(event.source==='news'||typeof event.query!=='string'||event.query.trim().length<2||event.query.length>100||!Number.isInteger(event.offset??0)||(event.offset??0)<0||(event.offset??0)>MAX_RECORDS)return {errMsg:'搜索词需2至100个字符，分页位置须有效'};
   if(event.snapshot!==undefined&&(typeof event.snapshot!=='string'||!HEX.test(event.snapshot)))return {errMsg:'资料版本无效'};
   const result=await manifest(event.source,event.snapshot);stage='search-index';
   return await searchRows(event.source,result,event.query,event.offset??0);
  }
  const page=event.page===undefined?0:event.page;
  if(!Number.isInteger(page)||page<0||page>=MAX_RECORDS/PAGE_SIZE)return {errMsg:'资料页码无效'};
  if(event.snapshot!==undefined&&(typeof event.snapshot!=='string'||!HEX.test(event.snapshot)))return {errMsg:'资料版本无效'};
  let result=await manifest(event.source,event.snapshot),data=result.data;
  const limit=event.windowLimit===undefined?MAX_RECORDS:event.windowLimit;
  if(!Number.isInteger(limit)||limit<400||limit>MAX_RECORDS||limit%PAGE_SIZE!==0)return {errMsg:'目录窗口无效'};
  const total=Math.min(data.total,limit);
  if(page>=Math.max(1,Math.ceil(total/PAGE_SIZE)))return {errMsg:'资料页不存在'};
  stage='page';let content;
  try{content=await pageRows(event.source,result,page);}catch(error){
   // Only the first unpinned request may select a bundled version. Later
   // requests must retain their exact snapshot and cannot mix page versions.
   if(event.snapshot!==undefined||page!==0||error?.code!=='ENOENT')throw error;
   const bundled=validateManifest(JSON.parse(fs.readFileSync(path.join(__dirname,'snapshots',event.source,'manifest.json'),'utf8')),event.source);
   if(bundled.snapshot===data.snapshot)throw error;
   result={data:bundled,upstreamAvailable:false,checkedAt:Date.now()};data=bundled;
   content=await pageRows(event.source,result,0);
  }
  const responseTotal=Math.min(data.total,limit);
  return {snapshot:data.snapshot,checkedAt:result.checkedAt,upstreamAvailable:result.upstreamAvailable&&content.upstreamAvailable,metadata:{...data.metadata,sourceTotal:data.total,loadedTotal:responseTotal,complete:responseTotal===data.total},key:data.key,items:content.rows,total:responseTotal,page,hasMore:(page+1)*PAGE_SIZE<responseTotal};
 }catch(error){
  const diagnostic={event:'catalog-read-failed',source:event.source,stage};
  if(SAFE_ERROR_CODES.has(error?.code))diagnostic.errorCode=error.code;
  else if(SAFE_ERROR_CODES.has(error?.name))diagnostic.errorCode=error.name;
  console.warn(JSON.stringify(diagnostic));
  return {errMsg:'资料暂时不可用，请保留上次成功同步的数据并稍后重试'};
 }
};
