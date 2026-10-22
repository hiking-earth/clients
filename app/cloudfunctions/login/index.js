// Trusted Mini Program context; never accept OPENID/UNIONID from request data.
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('hex');
exports.main = async (event = {}) => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext();
  if (!OPENID || !APPID) return { errMsg: '请先在微信小程序登录' };
  const db = cloud.database({ throwOnNotFound: false });
  const username = 'wx_' + hash(`${APPID}:${OPENID}`).slice(0, 24), accountId = hash(username);
  const account = await db.runTransaction(async tx => {
    const ref = tx.collection('client_accounts').doc(accountId);
    const prior = (await ref.get()).data;
    if (prior) {
      if (prior.authProvider !== 'wechat' || prior.wechatAppId !== APPID || prior.wechatOpenId !== OPENID) throw new Error('微信身份映射冲突，请联系管理员');
      if (prior.disabled || (prior.deleting && event.action !== 'reauth')) throw new Error('账号已停用');
      return prior;
    }
    // Preserve the existing WeChat business identity and data ownership.
    const value = { username, identity: OPENID, nickname: '山友',
      salt: random(), passwordHash: random(), recoveryHash: random(),
      sessionVersion: 0, createdAt: Date.now(), disabled: false,
      authProvider: 'wechat', wechatAppId: APPID, wechatOpenId: OPENID,
      ...(UNIONID ? { wechatUnionId: UNIONID } : {}),
    };
    await ref.set({ data: value }); return value;
  });
  const ticket = random(), expiresAt = Date.now() + 60000;
  await db.collection('client_wechat_tickets').doc(hash(ticket)).set({ data: {
    accountId, expiresAt, used: false,
  } });
  return { openid: account.identity, nickname: account.nickname, ticket, expiresAt };
};
