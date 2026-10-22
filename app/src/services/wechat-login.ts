import { accountRequest, accountSession, type AccountSession } from './account';
import { callCloud } from './cloud';

type WeChatLoginTicket = { openid: string; ticket: string; expiresAt: number };

/** Exchange trusted Mini Program identity into the shared cross-platform account. */
export async function exchangeMiniProgramWeChat(): Promise<AccountSession> {
  // #ifndef MP-WEIXIN
  throw new Error('请在徒步地球微信小程序中使用微信一键登录');
  // #endif
  // #ifdef MP-WEIXIN
  return exchangeTrustedMiniProgramIdentity();
  // #endif
}

// #ifdef MP-WEIXIN
async function exchangeTrustedMiniProgramIdentity(): Promise<AccountSession> {
  if (accountSession()) throw new Error('当前已有账号登录，请先退出再切换身份');
  const issued = await callCloud<WeChatLoginTicket>('login');
  if (!issued.ok || !issued.data) throw new Error(issued.errMsg || '微信身份确认失败');
  const value = issued.data;
  const now = Date.now();
  if (typeof value.openid !== 'string' || !value.openid || value.openid.length > 128
      || typeof value.ticket !== 'string' || !/^[a-f0-9]{64}$/.test(value.ticket)
      || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + 120_000) {
    throw new Error('微信登录凭据无效或已过期');
  }
  const exchanged = await accountRequest<AccountSession>('auth.wechat.exchange', { ticket: value.ticket });
  if (!exchanged.ok || !exchanged.data) throw new Error(exchanged.errMsg || '微信账号登录未完成');
  if (accountSession()) throw new Error('账号已改变，请确认当前账号后重试');
  if (exchanged.data.openid !== value.openid || typeof exchanged.data.username !== 'string'
      || !exchanged.data.username.startsWith('wx_')
      || typeof exchanged.data.nickname !== 'string' || exchanged.data.nickname.length > 24
      || !/^[a-f0-9]{64}$/.test(exchanged.data.token)
      || !Number.isFinite(exchanged.data.expiresAt) || exchanged.data.expiresAt <= Date.now()) {
    throw new Error('微信登录身份映射不一致');
  }
  return exchanged.data;
}
// #endif
