const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../../app/node_modules/typescript');
function fixture(){
 let session={token:'first'},accountChanged,scanOptions,unload;const replies=[];
 const account={accountSession:()=>session,onAccountChange:fn=>{accountChanged=fn;return()=>{};},accountRequest:()=>new Promise(resolve=>replies.push(resolve)),saveAccount:s=>{session=s;accountChanged();}};
 let source=fs.readFileSync(require.resolve('../../app/src/pages/account/qr-confirm.vue'),'utf8').split('<script setup lang="ts">')[1].split('</script>')[0];
 source=source.replace(/\/\/ #ifndef MP-WEIXIN[\s\S]*?\/\/ #endif/g,'');
 source+='\nexport {inspect,confirm,scan,challenge,device,message,signedIn,completed};';
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};vm.runInNewContext(js,{exports,require:name=>name==='vue'?{ref:value=>({value})}:name==='@dcloudio/uni-app'?{onLoad:()=>{},onShow:()=>{},onUnload:fn=>{unload=fn;}}:name.includes('/account')?account:{initCloud:()=>{}},uni:{scanCode:o=>{scanOptions=o;}}});
 return {page:exports,replies,change:()=>{session={token:'second'};accountChanged();},scanOptions:()=>scanOptions,unload:()=>unload()};
}
test('account switch rejects delayed inspection and clears prior device',async()=>{const f=fixture();f.page.challenge.value='a'.repeat(64);const wait=f.page.inspect();f.change();f.replies.shift()({ok:true,data:{status:'pending',deviceLabel:'old'}});await wait;assert.equal(f.page.device.value,'');assert.equal(f.page.challenge.value,'');});
test('invalid scan cannot leave the previous device confirmable',()=>{const f=fixture();f.page.device.value='old';f.page.challenge.value='a'.repeat(64);f.page.scan();f.scanOptions().success({result:'wrong'});assert.equal(f.page.device.value,'');assert.equal(f.page.challenge.value,'');});
test('unloaded page ignores delayed confirmation success',async()=>{const f=fixture();f.page.device.value='device';f.page.challenge.value='a'.repeat(64);const wait=f.page.confirm();f.unload();f.replies.shift()({ok:true});await wait;assert.equal(f.page.completed.value,false);});
test('stale scan callback after account switch is ignored',()=>{const f=fixture();f.page.scan();const callback=f.scanOptions();f.change();callback.success({result:'hiking-earth-login:'+'a'.repeat(64)});assert.equal(f.page.challenge.value,'');assert.equal(f.replies.length,0);});
