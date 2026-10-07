// One-time device login exchange. No bearer token is stored in QR contents.
const crypto = require('crypto');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('hex');
const valid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = message => { const error = new Error(message); error.status = 400; throw error; };
const TTL = 3 * 60 * 1000;
function service({ db, accountById, issueSession, clock = Date.now }) {
  const collection = 'client_qr_logins';
  async function start(data) {
    const challenge = random(), claimSecret = random(), expiresAt = clock() + TTL;
    const label = typeof data.deviceLabel === 'string' ? data.deviceLabel.trim().slice(0, 60) : '';
    await db.collection(collection).doc(digest(challenge)).set({ data: {
      secretHash: digest(claimSecret), status: 'pending', deviceLabel: label || '网页或桌面设备',
      createdAt: clock(), expiresAt,
    } });
    return { challenge, claimSecret, expiresAt };
  }
  async function transact(challenge, operation) {
    if (!valid(challenge)) fail('登录二维码无效');
    return db.runTransaction(async tx => {
      const ref = tx.collection(collection).doc(digest(challenge));
      const value = (await ref.get()).data;
      if (!value || value.expiresAt <= clock()) fail('登录二维码已过期，请重新生成');
      return operation(value, ref);
    });
  }
  async function inspect(data) {
    return transact(data.challenge, value => ({ deviceLabel: value.deviceLabel,
      expiresAt: value.expiresAt, status: value.status }));
  }
  async function confirm(data, account) {
    if (data.confirmed !== true) fail('请明确确认登录此设备');
    return transact(data.challenge, async (value, ref) => {
      if (value.status !== 'pending') fail('二维码已处理，请重新生成');
      await ref.update({ data: { status: 'approved', accountId: digest(account.username), sessionVersion: account.sessionVersion } });
      return { confirmed: true };
    });
  }
  async function claim(data) {
    if (!valid(data.claimSecret)) fail('登录领取凭据无效');
    const result = await transact(data.challenge, async (value, ref) => {
      if (!['pending', 'approved'].includes(value.status)) fail('二维码已领取或取消，请重新生成');
      if (!crypto.timingSafeEqual(Buffer.from(value.secretHash, 'hex'), Buffer.from(digest(data.claimSecret), 'hex'))) fail('登录领取凭据无效');
      if (value.status === 'pending') return { status: 'pending', expiresAt: value.expiresAt };
      if (value.status !== 'approved') fail('二维码已领取或取消，请重新生成');
      await ref.update({ data: { status: 'consumed', secretHash: '', accountId: '' } });
      return { accountId: value.accountId, sessionVersion: value.sessionVersion };
    });
    if (result.status === 'pending') return result;
    const account = await accountById(result.accountId);
    if (!account || account.disabled || account.deleting || account.sessionVersion !== result.sessionVersion) fail('账号已停用，无法登录');
    return { status: 'signed-in', session: await issueSession(account) };
  }
  async function cancel(data) {
    if (!valid(data.claimSecret)) fail('登录领取凭据无效');
    return transact(data.challenge, async (value, ref) => {
      if (value.secretHash !== digest(data.claimSecret)) fail('登录领取凭据无效');
      if (!['pending', 'approved'].includes(value.status)) fail('二维码已处理');
      await ref.update({ data: { status: 'cancelled', secretHash: '', accountId: '' } });
      return { cancelled: true };
    });
  }
  return { start, inspect, confirm, claim, cancel };
}
module.exports = { service, TTL };
