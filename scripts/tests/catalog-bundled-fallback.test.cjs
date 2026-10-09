const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const file of ['app/cloudfunctions/catalog-feed/index.js','app/cloudfunctions/client-api/business/catalog-feed/index.js']){
 function fixture({corrupt=false,upstreamCorrupt=false}={}){
  const rows=Buffer.from(JSON.stringify([{id:'bundled'}])),old='a'.repeat(64),fresh='b'.repeat(64);
  const manifest=snapshot=>({schemaVersion:1,snapshot,key:'routes',total:1,pageSize:400,pages:[hash(rows)],indexHash:'c'.repeat(64),metadata:{schemaVersion:1,generatedAt:snapshot===fresh?'2026-10-09T00:00:00Z':'2026-10-08T00:00:00Z'}});
  const exports={},warnings=[];
  const stub=name=>name==='fs'?{readFileSync(path){if(path.endsWith('manifest.json'))return JSON.stringify(manifest(old));if(path.includes(old)&&path.endsWith('.json.gz'))return zlib.gzipSync(corrupt?Buffer.from('[{}]'):rows);throw Object.assign(Error('missing'),{code:'ENOENT'});}}:require(name);
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:stub,exports,__dirname:'/fixture',Buffer,AbortSignal,console:{warn:v=>warnings.push(v)},fetch:async url=>{if(url.endsWith('/hk/manifest.json'))return {ok:true,headers:{get:()=>null},body:[Buffer.from(JSON.stringify(manifest(fresh)))]};if(upstreamCorrupt&&url.includes(fresh)&&url.endsWith('.json.gz'))return {ok:true,headers:{get:()=>null},body:[zlib.gzipSync(Buffer.from('[{}]'))]};throw Error('upstream page unavailable');}});
  return {main:exports.main,old,fresh,warnings};
 }
 test(file+' first unpinned page falls back to verified bundled version',async()=>{const f=fixture(),r=await f.main({source:'hk',page:0,windowLimit:40000});assert.equal(r.snapshot,f.old);assert.equal(r.total,1);assert.equal(r.items[0].id,'bundled');assert.equal(r.upstreamAvailable,false);assert.equal(r.metadata.loadedTotal,1);assert.equal(r.hasMore,false);});
 test(file+' explicit snapshot never silently changes version',async()=>{const f=fixture(),r=await f.main({source:'hk',page:0,snapshot:f.fresh,windowLimit:40000});assert.ok(r.errMsg);assert.equal(r.items,undefined);});
 test(file+' corrupt upstream never triggers fallback',async()=>{const f=fixture({upstreamCorrupt:true}),r=await f.main({source:'hk',page:0,windowLimit:40000});assert.ok(r.errMsg);assert.equal(r.items,undefined);});
 test(file+' corrupt bundled page stays rejected',async()=>{const f=fixture({corrupt:true}),r=await f.main({source:'hk',page:0,windowLimit:40000});assert.ok(r.errMsg);assert.equal(r.items,undefined);});
}
