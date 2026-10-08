const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const file of ['app/cloudfunctions/catalog-feed/index.js','app/cloudfunctions/client-api/business/catalog-feed/index.js'])test(file+' logs only safe source and stage',async()=>{
 const warnings=[],exports={};
 const requireStub=name=>name==='fs'?{readFileSync(){throw Error('private file path and credential');}}:require(name);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:requireStub,exports,__dirname:'/private',Buffer,AbortSignal,fetch:async()=>{throw Error('private request details');},console:{warn:value=>warnings.push(value)}});
 const response=await exports.main({source:'hk',page:0,query:'private input',token:'private token'});
 assert.equal(response.errMsg,'资料暂时不可用，请保留上次成功同步的数据并稍后重试');
 assert.equal(warnings.length,1);assert.deepEqual(JSON.parse(warnings[0]),{event:'catalog-read-failed',source:'hk',stage:'manifest'});
 assert.doesNotMatch(JSON.stringify(response)+warnings.join(''),/private/);
});
