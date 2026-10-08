const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const p=require('../../shared/design/palette.json');
test('all client primary theme declarations match published website green',()=>{assert.equal(p.accent,'#b8f36b');for(const f of ['app/src/App.vue','app/src/uni.scss','app/src/pages.json','app/src/pages/index/index.vue']){const s=fs.readFileSync(f,'utf8');assert.ok(s.includes(p.accent),f);assert.ok(!/#48c9a8|#a7dfbf|#16a88c/i.test(s),f);}});
test('every client page and component rejects superseded green themes',()=>{
 function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())visit(path);else if(/\.(vue|scss|css|json)$/.test(path))assert.ok(!/#48c9a8|#a7dfbf|#16a88c/i.test(fs.readFileSync(path,'utf8')),path);}}
 visit('app/src/pages');visit('app/src/components');
});
test('website reference and shared client use identical accent',()=>{
 if(!fs.existsSync('web/app/globals.css'))return;
 const css=fs.readFileSync('web/app/globals.css','utf8');
 assert.equal(css.match(/--lime:\s*(#[0-9a-f]{6})/i)?.[1].toLowerCase(),p.accent);
});
