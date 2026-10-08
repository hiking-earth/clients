const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const p=require('../../shared/design/palette.json');
test('all client primary theme declarations match published website green',()=>{assert.equal(p.accent,'#b8f36b');for(const f of ['app/src/App.vue','app/src/uni.scss','app/src/pages.json','app/src/pages/index/index.vue']){const s=fs.readFileSync(f,'utf8');assert.ok(s.includes(p.accent),f);assert.ok(!/#48c9a8|#a7dfbf|#16a88c/i.test(s),f);}});
