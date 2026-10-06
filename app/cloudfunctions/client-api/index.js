// HTTP gateway. Identity is resolved from an opaque session, never request data.
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const { promisify } = require('util');
const { withIdentity } = require('./identity');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
const derive = promisify(crypto.scrypt);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY = 6 * 1024 * 1024;
const handlers = new Set(['catalog-feed', 'route-manage', 'social-manage', 'companion-create', 'companion-list', 'companion-join',
  'companion-report', 'companion-manage', 'team-manage', 'library-manage', 'community-moderate', 'team-create', 'team-join', 'team-leave', 'team-stop',
  'team-report', 'team-locations', 'team-current', 'track-sync', 'track-manage', 'sos-trigger', 'guide-list']);
const publicHandlers = new Set(['catalog-feed', 'companion-list', 'guide-list']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('hex');
function fail(message, status = 400, code) { const e = new Error(message); e.status = status; e.code = code; throw e; }
function nameOf(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{3,31}$/.test(name)) fail('账号需为4–32位字母、数字、点、下划线或短横线');
  return name;
}
function passwordOf(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) fail('密码需为10–128个字符');
  return value;
}
const accountDoc = name => db.collection('client_accounts').doc(hash(name));
function profile(account) { return { openid: account.identity, nickname: account.nickname, username: account.username }; }
function equalHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
async function limit(scope, max) {
  const window = Math.floor(Date.now() / (15 * 60 * 1000));
  const id = hash(`${scope}:${window}`);
  await db.runTransaction(async tx => {
    const ref = tx.collection('client_rate_limits').doc(id);
    const prior = (await ref.get()).data;
    if ((prior?.count || 0) >= max) fail('操作过于频繁，请稍后重试', 429);
    await ref.set({ data: { count: (prior?.count || 0) + 1, expiresAt: (window + 2) * 15 * 60 * 1000 } });
  });
}
async function newSession(account) {
  const token = random(); const expiresAt = Date.now() + SESSION_MS;
  await db.collection('client_sessions').doc(hash(token)).set({ data: {
    accountId: hash(account.username), sessionVersion: account.sessionVersion,
    expiresAt, createdAt: Date.now(),
  } });
  return { ...profile(account), token, expiresAt };
}
async function verifiedSession(token, allowDeletion = false) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) fail('请先登录', 401, 'SESSION_EXPIRED');
  const session = (await db.collection('client_sessions').doc(hash(token)).get()).data;
  if (!session || session.expiresAt <= Date.now()) fail('登录已过期，请重新登录', 401, 'SESSION_EXPIRED');
  const account = (await db.collection('client_accounts').doc(session.accountId).get()).data;
  if (!account || account.disabled || account.sessionVersion !== session.sessionVersion) fail('登录已失效，请重新登录', 401, 'SESSION_EXPIRED');
  if (account.deleting && !allowDeletion) fail('账号注销尚未完成，请前往账号管理继续注销', 403, 'ACCOUNT_DELETING');
  return account;
}
async function credentials(data) {
  const username = nameOf(data.username);
  await limit(`login:${username}`, 15);
  const account = (await accountDoc(username).get()).data;
  // Spend the same expensive hash computation for unknown names.
  const candidate = (await derive(String(data.password || '').slice(0, 128), account?.salt || 'unknown-account', 32)).toString('hex');
  if (!account || account.disabled || !equalHex(candidate, account.passwordHash)) fail('账号或密码不正确', 401);
  return account;
}
async function register(data, remoteAddress) {
  const username = nameOf(data.username), password = passwordOf(data.password);
  await limit(`register:name:${username}`, 3);
  // HTTP instances may share a proxy address; keep this a global burst guard.
  await limit(`register:${hash(remoteAddress)}`, 50);
  const salt = random(), recoveryCode = random();
  const passwordHash = (await derive(password, salt, 32)).toString('hex');
  const account = { username, identity: `account:${crypto.randomBytes(16).toString('hex')}`,
    nickname: String(data.nickname || '山友').trim().slice(0, 24) || '山友', salt, passwordHash,
    recoveryHash: hash(recoveryCode), sessionVersion: 0, createdAt: Date.now(), disabled: false };
  await db.runTransaction(async tx => {
    const ref = tx.collection('client_accounts').doc(hash(username));
    if ((await ref.get()).data) fail('该账号已存在');
    await ref.set({ data: account });
  });
  return { ...(await newSession(account)), recoveryCode };
}
async function recover(data) {
  const username = nameOf(data.username), password = passwordOf(data.password);
  await limit(`recover:${username}`, 10);
  const code = String(data.recoveryCode || '').trim();
  if (!/^[a-f0-9]{64}$/.test(code)) fail('账号或恢复码不正确', 401);
  const salt = random(), recoveryCode = random();
  const passwordHash = (await derive(password, salt, 32)).toString('hex');
  const account = await db.runTransaction(async tx => {
    const ref = tx.collection('client_accounts').doc(hash(username));
    const account = (await ref.get()).data;
    if (!account || account.disabled || account.deleting || !equalHex(hash(code), account.recoveryHash)) fail('账号或恢复码不正确', 401);
    const updates = { salt, passwordHash, recoveryHash: hash(recoveryCode), sessionVersion: account.sessionVersion + 1 };
    await ref.update({ data: updates });
    return { ...account, ...updates };
  });
  return { ...(await newSession(account)), recoveryCode };
}
async function changePassword(account, data) {
  const password = passwordOf(data.newPassword);
  await credentials({ username: account.username, password: data.password });
  const salt = random(), passwordHash = (await derive(password, salt, 32)).toString('hex');
  const updated = await db.runTransaction(async tx => {
    const ref = tx.collection('client_accounts').doc(hash(account.username));
    const latest = (await ref.get()).data;
    // A concurrent recovery invalidates the credentials check above.
    if (!latest || latest.disabled || latest.passwordHash !== account.passwordHash) fail('账号状态已改变，请重新登录', 401);
    const updates = { salt, passwordHash, sessionVersion: latest.sessionVersion + 1 };
    await ref.update({ data: updates }); return { ...latest, ...updates };
  });
  return newSession(updated);
}
async function stopSharing(identity) {
  await db.collection('team_members').where({ openid: identity }).update({ data: { latitude: null, longitude: null, updatedAt: 0 } });
}
async function businessOperation(account, token, operation) {
  const operationId = random(), tokenHash = hash(token);
  await db.runTransaction(async tx => {
    const ref = tx.collection('client_accounts').doc(hash(account.username));
    const latest = (await ref.get()).data;
    const session = (await tx.collection('client_sessions').doc(tokenHash).get()).data;
    if (latest?.deleting) fail('账号注销尚未完成，请前往账号管理继续注销', 403, 'ACCOUNT_DELETING');
    if (!latest || latest.disabled || !session || session.expiresAt <= Date.now() || session.sessionVersion !== latest.sessionVersion) fail('账号状态已改变，请重新登录', 401, 'SESSION_EXPIRED');
    const operations = (latest.operations || []).filter(item => item.until > Date.now());
    if (operations.length >= 20) fail('正在处理较多请求，请稍后重试', 429);
    operations.push({ id: operationId, until: Date.now() + 10 * 60 * 1000 });
    await ref.update({ data: { operations } });
  });
  try { return await operation(); }
  finally {
    await db.runTransaction(async tx => {
      const ref = tx.collection('client_accounts').doc(hash(account.username));
      const latest = (await ref.get()).data;
      if (latest && !latest.disabled) await ref.update({ data: { operations: (latest.operations || []).filter(item => item.id !== operationId && item.until > Date.now()) } });
    });
    // A request already in flight at logout must not leave a last location behind.
    const session = (await db.collection('client_sessions').doc(tokenHash).get()).data;
    const latest = (await accountDoc(account.username).get()).data;
    if (!session || !latest || latest.deleting || latest.disabled || session.sessionVersion !== latest.sessionVersion) await stopSharing(account.identity);
  }
}
async function dispatch(action, data, token, remoteAddress) {
  if (action === 'auth.register') return register(data, remoteAddress);
  if (action === 'auth.sign-in') return newSession(await credentials(data));
  if (action === 'auth.recover') return recover(data);
  if (publicHandlers.has(action)||(action==='route-manage'&&data.action==='list')) {
    if(action==='catalog-feed')await limit(`catalog:${hash(remoteAddress)}`,500);
    const identity = token ? (await verifiedSession(token)).identity : '';
    return withIdentity(identity, () => require(`./business/${action}`).main(data));
  }
  const account = await verifiedSession(token, action === 'auth.delete');
  if (action === 'auth.delete') {
    const candidate = (await derive(String(data.password || '').slice(0, 128), account.salt, 32)).toString('hex');
    if (!equalHex(candidate, account.passwordHash)) fail('当前密码不正确', 400);
    return require('./delete-account').deleteAccount(db, account, hash(token));
  }
  if (action === 'login' || action === 'auth.profile') return profile(account);
  if (action === 'auth.sign-out') {
    await stopSharing(account.identity);
    await db.collection('client_sessions').doc(hash(token)).remove(); return { signedOut: true };
  }
  if (action === 'auth.sign-out-all') {
    await stopSharing(account.identity);
    await accountDoc(account.username).update({ data: { sessionVersion: db.command.inc(1) } });
    return { signedOut: true };
  }
  if (action === 'auth.password') return changePassword(account, data);
  if (action === 'auth.nickname') {
    const nickname = String(data.nickname || '').trim().slice(0, 24);
    if (!nickname) fail('请输入昵称');
    await accountDoc(account.username).update({ data: { nickname } });
    await db.collection('team_members').where({ openid: account.identity }).update({ data: { nickname } });
    return profile({ ...account, nickname });
  }
  if (action === 'gear-scan') {
    await limit(`gear:${account.identity}`, 10);
    if (typeof data.image !== 'string' || data.image.length > 5.6 * 1024 * 1024) fail('图片过大或格式不正确');
    // Keep the AI provider credentials in the existing isolated function.
    const result = await businessOperation(account, token, () => cloud.callFunction({ name: 'gear-scan', data: {
      image: data.image, routeName: String(data.routeName || '').slice(0, 120),
    } }));
    return result.result;
  }
  if (!handlers.has(action)) fail('不支持此操作', 404);
  return businessOperation(account, token, () => withIdentity(account.identity, () => require(`./business/${action}`).main({ ...data, nickname: account.nickname })));
}
exports.main = async event => {
  const headers = { 'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization', 'cache-control': 'no-store' };
  const response = (statusCode, value) => ({ statusCode, headers, body: JSON.stringify(value) });
  if (event.httpMethod === 'OPTIONS') return response(204, {});
  if (event.httpMethod !== 'POST') return response(405, { ok: false, errMsg: '只支持POST请求' });
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body;
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BODY) fail('请求体过大或格式不正确', 413);
    let request; try { request = JSON.parse(raw); } catch { fail('请求格式不正确'); }
    if (!request || typeof request.action !== 'string' || request.action.length > 64) fail('缺少操作名称');
    const incoming = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const token = String(incoming.authorization || '').replace(/^Bearer /i, '');
    const data = request.data && typeof request.data === 'object' && !Array.isArray(request.data) ? request.data : {};
    const remote = String(event.requestContext?.identity?.sourceIp || event.requestContext?.sourceIp || 'unknown');
    const result = await dispatch(request.action, data, token, remote);
    if (result?.errMsg || result?.ok === false) return response(400, { ok: false, errMsg: String(result.errMsg || '操作未完成'), code: result.code === 'TEAM_REQUEST_EXPIRED' ? result.code : undefined });
    return response(200, { ok: true, data: result });
  } catch (error) {
    // Never return headers, SDK exceptions or environment credentials.
    return response(error.status || 500, { ok: false, errMsg: error.status ? error.message : '服务暂时不可用，请稍后重试', code: error.code });
  }
};
