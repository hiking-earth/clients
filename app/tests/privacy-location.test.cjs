const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function setup(extra = {}) {
  const storage = new Map(), intervals = new Map(), events = new Set(), compass = new Set();
  const requests = [];
  let starts = 0, stops = 0;
  const uni = {
    getStorageSync: k => storage.get(k), setStorageSync: (k, v) => storage.set(k, v),
    startLocationUpdate: opts => { starts++; requests.push(opts); },
    stopLocationUpdate: () => { stops++; },
    onLocationChange: fn => events.add(fn), offLocationChange: fn => events.delete(fn),
    onCompassChange: fn => compass.add(fn), offCompassChange: fn => compass.delete(fn),
    getLocation: opts => opts.success({ latitude: 1, longitude: 2, altitude: 0 }),
  };
  let timer = 0;
  const context = vm.createContext({ uni, console, ...extra,
    setInterval: fn => { intervals.set(++timer, fn); return timer; },
    clearInterval: id => intervals.delete(id),
  });
  const cache = new Map();
  function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const requireLocal = name => {
      const target = name.startsWith('@/') ? 'src/' + name.slice(2) : '../shared/' + name.slice(8);
      const p = path.resolve(__dirname, '..', target);
      return load(fs.existsSync(p + '.ts') ? p + '.ts' : path.join(p, 'index.ts'));
    };
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context)(requireLocal, mod, mod.exports);
    return mod.exports;
  }
  const privacy = load('src/services/privacy.ts'), location = load('src/services/location.ts');
  return { uni, privacy, location, load, intervals, requests, events, compass, get starts() { return starts; }, get stops() { return stops; } };
}
test('default denial does not start native location', async () => {
  const h = setup(); assert.equal(await h.location.startLocationUpdates(() => {}), false); assert.equal(h.starts, 0);
});
test('revocation stops active stream and removes exact listeners', async () => {
  const h = setup(); h.privacy.setPrivacyConsent('location', true);
  const p = h.location.startLocationUpdates(() => {}); h.requests[0].success(); assert.equal(await p, true);
  h.location.startCompass(() => {});
  h.privacy.setPrivacyConsent('location', false);
  assert.equal(h.events.size, 0); assert.equal(h.compass.size, 0); assert.ok(h.stops > 0);
});
test('permission failure is not reported as a successful start', async () => {
  const h = setup(); h.privacy.setPrivacyConsent('location', true);
  const p = h.location.startLocationUpdates(() => {}); h.requests[0].fail({ errMsg: 'auth deny' });
  assert.equal(await p, false); assert.equal(h.intervals.size, 0);
});
test('unsupported API fallback timer is stopped and late results ignored', async () => {
  const h = setup(); let count = 0; h.privacy.setPrivacyConsent('location', true);
  const cb = () => count++;
  const p = h.location.startLocationUpdates(cb); h.requests[0].fail({ errMsg: 'not support' });
  assert.equal(await p, true); assert.equal(count, 1); assert.equal(h.intervals.size, 1);
  let late; h.uni.getLocation = opts => { late = opts.success; };
  [...h.intervals.values()][0](); h.location.stopLocationUpdates(cb); late({ latitude: 1, longitude: 2 });
  assert.equal(h.intervals.size, 0); assert.equal(count, 1);
});
test('cancel pending start cannot revive location after native success', async () => {
  const h = setup(); h.privacy.setPrivacyConsent('location', true);
  const cb = () => {}; const p = h.location.startLocationUpdates(cb);
  h.location.stopLocationUpdates(cb); assert.equal(await p, false);
  h.requests[0].success(); assert.equal(h.events.size, 0);
});
test('multiple consumers share one start; revoking team preserves navigation', async () => {
  const h = setup(); h.privacy.setPrivacyConsent('location', true); h.privacy.setPrivacyConsent('teamLocation', true);
  let nav = 0, team = 0;
  const a = h.location.startLocationUpdates(() => nav++), b = h.location.startLocationUpdates(() => team++, 'team');
  assert.equal(h.starts, 1); h.requests[0].success(); assert.equal(await a, true); assert.equal(await b, true);
  h.privacy.setPrivacyConsent('teamLocation', false);
  [...h.events][0]({ latitude: 1, longitude: 2 }); assert.equal(nav, 1); assert.equal(team, 0);
});
test('App/H5 must not fabricate successful login, sync or SOS', async () => {
  const h = setup(); h.privacy.setPrivacyConsent('trackCloudSync', true);
  const cloud = h.load('src/services/cloud.ts');
  for (const name of ['login', 'track-sync', 'sos-trigger', 'team-create']) assert.equal((await cloud.callCloud(name)).ok, false);
});
test('cloud rejects business errors and revoked uploads before transport', async () => {
  let calls = 0;
  const h = setup({ wx: { cloud: { init() {}, async callFunction() { calls++; return { result: { errMsg: 'invalid track' } }; } } } });
  const cloud = h.load('src/services/cloud.ts');
  assert.equal((await cloud.callCloud('track-sync')).ok, false); assert.equal(calls, 0);
  h.privacy.setPrivacyConsent('trackCloudSync', true);
  const result = await cloud.callCloud('track-sync'); assert.equal(result.ok, false); assert.equal(result.errMsg, 'invalid track');
});
