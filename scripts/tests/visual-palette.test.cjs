const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const p=require('../../shared/design/palette.json');
test('all client primary theme declarations match published website green',()=>{assert.equal(p.accent,'#b8f36b');for(const f of ['app/src/App.vue','app/src/uni.scss','app/src/pages.json','app/src/pages/index/index.vue']){const s=fs.readFileSync(f,'utf8');assert.ok(s.includes(p.accent),f);assert.ok(!/#48c9a8|#a7dfbf|#16a88c|#3b8b7b/i.test(s),f);}});
test('every client page and component rejects superseded green themes',()=>{
 function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())visit(path);else if(/\.(vue|scss|css|json)$/.test(path)){const source=fs.readFileSync(path,'utf8');assert.ok(!/#48c9a8|#a7dfbf|#16a88c|#3b8b7b/i.test(source),path);for(const tag of source.match(/<switch\b[^>]*>/g)||[])assert.ok(tag.includes(`color="${p.accent}"`),path);}}}
 visit('app/src/pages');visit('app/src/components');
});
test('website reference and shared client use identical accent',()=>{
 if(!fs.existsSync('web/app/globals.css'))return;
 const css=fs.readFileSync('web/app/globals.css','utf8');
 assert.equal(css.match(/--lime:\s*(#[0-9a-f]{6})/i)?.[1].toLowerCase(),p.accent);
 assert.match(css,/rgba\(184,243,107,/i,'website accent tints must use the published lime green');
 assert.doesNotMatch(css,/rgba\(167,223,191,/i,'superseded mint-green accent tints must not remain');
});
