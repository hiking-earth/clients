const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('../../app/node_modules/typescript');
const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../app/src/services/route-catalog.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(saved){
 let fail=true,calls=0;const exports={};const data=source=>({schemaVersion:1,license:source==='hk'?'DATA.GOV.HK-terms-1.2':'ODbL-1.0',attribution:'USDA Forest Service',generatedAt:new Date().toISOString(),routes:[]});
 const requireStub=name=>name==='vue'?{reactive:x=>x}:name==='./public-data'?{publicSnapshot:async source=>{calls++;if(fail)throw new Error('private transport details');return data(source);}}:name==='./catalog-cache'?{readCatalogCache:async(source,valid)=>saved&&valid(data(source))?data(source):null,writeCatalogCache:async()=>{}}:name.includes('routes.catalog')?{ROUTES:[],catalogRoutes:()=>[]}:{ROUTES:[]};
 new Function('require','exports','uni',code)(requireStub,exports,{getStorageSync:()=>null,setStorageSync:()=>{}});
 return {exports,calls:()=>calls,recover:()=>{fail=false;}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
for(const saved of [false,true])test('failed refresh reports retained cache state '+saved,async()=>{
 const f=fixture(saved);f.exports.refreshRouteCatalog();await flush();
 for(const source of ['osm','usfs','hk']){const row=f.exports.catalogCacheState[source];assert.equal(row.saved,saved);assert.match(row.message,/目录更新失败/);assert.match(row.message,saved?/保留本机资料/:/暂无本机缓存/);assert.doesNotMatch(row.message,/private transport/);}
 assert.equal(f.calls(),3);f.exports.refreshRouteCatalog();await flush();assert.equal(f.calls(),3);
 f.recover();f.exports.refreshRouteCatalog(true);await flush();assert.equal(f.calls(),6);
 for(const source of ['osm','usfs','hk'])assert.match(f.exports.catalogCacheState[source].message,/已保存/);
});
