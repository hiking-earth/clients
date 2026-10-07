import { CLIENT_API_URL, CLOUD_ENV } from '@shared/constants';
// #ifdef H5
import { needsGatewayRelay, gatewayRelayRequest } from '@shared/network/gateway-relay';
// #endif
import { stopBackgroundRecording } from '@/services/background';
import { listTracks, saveTrack, setTrackAutoSyncExcluded, trackStorageValid } from '@/services/tracks';
import { stopCompass, stopLocationUpdates } from '@/services/location';
declare const wx: any;

export type AccountProfile = { openid: string; nickname: string; username: string };
export type AccountSession = AccountProfile & { token: string; expiresAt: number };
export type AccountResponse<T> = { ok: boolean; data?: T; errMsg?: string; code?: string };
const SESSION_KEY = 'he_account_session_v1';
const API_URL = String(import.meta.env.VITE_CLIENT_API_URL || CLIENT_API_URL).replace(/\/$/, '');
const subscribers = new Set<() => void>();
const locallyClearedTokens = new Set<string>();

function notifyAccountChange():boolean { let complete=true;for(const callback of [...subscribers])try{callback();}catch{complete=false;}return complete; }

export function accountApiConfigured(): boolean { return /^https:\/\//.test(API_URL); }
export function onAccountChange(callback: () => void): () => void {
  subscribers.add(callback); return () => subscribers.delete(callback);
}
export function accountSession(): AccountSession | null {
  try {
    const raw = uni.getStorageSync(SESSION_KEY);
    if (!raw) return null;
    const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof session?.token==='string'&&locallyClearedTokens.has(session.token)) return null;
    if (!session||typeof session!=='object'||Array.isArray(session)||typeof session.token!=='string'||!/^[a-f0-9]{64}$/.test(session.token)
      ||typeof session.openid!=='string'||!session.openid||session.openid.length>128
      ||typeof session.nickname!=='string'||session.nickname.length>24||typeof session.username!=='string'||session.username.length>32
      ||!Number.isFinite(session.expiresAt)||session.expiresAt<=Date.now()) {
      clearAccount(); return null;
    }
    return session;
  } catch { clearAccount(); return null; }
}
export function clearAccount(): boolean {
  let complete=true;const attempt=(operation:()=>void)=>{try{operation();}catch{complete=false;}};
  try{const raw=uni.getStorageSync(SESSION_KEY);const current=typeof raw==='string'?JSON.parse(raw):raw;if(typeof current?.token==='string'){locallyClearedTokens.add(current.token);if(locallyClearedTokens.size>32)locallyClearedTokens.delete(locallyClearedTokens.values().next().value!);}}catch{complete=false;}
  // Stop live location work even if any platform storage operation fails.
  attempt(()=>stopLocationUpdates());attempt(()=>stopCompass());attempt(()=>stopBackgroundRecording());
  for(const key of [SESSION_KEY,'he_openid','he_nickname','he_team'])try{uni.removeStorageSync(key);}catch{try{uni.setStorageSync(key,'');}catch{complete=false;}}
  return notifyAccountChange()&&complete;
}
/** Clear pending creation metadata only after the server confirms account deletion. */
export function clearDeletedAccountRequests(owner:string):boolean {
  let complete=true;
  try{uni.removeStorageSync(`he_team_creation_request_v1:${encodeURIComponent(owner)}`);}catch{complete=false;}
  try{const raw=uni.getStorageSync('he_team_creation_request_v1');const value=typeof raw==='string'?JSON.parse(raw):raw;
    if(value?.owner===owner)uni.removeStorageSync('he_team_creation_request_v1');
  }catch{complete=false;}
  return complete;
}
export function saveAccount(session: AccountSession): void {
  if (!session || !/^[a-f0-9]{64}$/.test(session.token) || typeof session.openid!=='string' || !session.openid || session.openid.length>128
    || typeof session.nickname!=='string' || session.nickname.length>24 || typeof session.username!=='string' || session.username.length>32
    || !Number.isFinite(session.expiresAt) || session.expiresAt<=Date.now()) throw new Error('登录响应无效');
  const changed=prepareLocalIdentity(session.openid);
  uni.setStorageSync(SESSION_KEY, JSON.stringify(session));
  uni.setStorageSync('he_openid', session.openid);
  uni.setStorageSync('he_nickname', session.nickname);
  locallyClearedTokens.delete(session.token);
  if (changed) notifyAccountChange();
}

/** Apply the same local privacy boundary when Mini Program users use native WeChat identity. */
export function saveWeChatIdentity(openid:string,nickname:string):void {
  if(typeof openid!=='string'||!openid||openid.length>128||openid==='local-mock-user'||openid.startsWith('account:'))throw new Error('微信登录身份无效');
  if(accountSession())throw new Error('统一账号仍处于登录状态，请先退出后再切换微信身份');
  const changed=prepareLocalIdentity(openid);
  uni.setStorageSync('he_openid',openid);
  uni.setStorageSync('he_nickname',typeof nickname==='string'?nickname.slice(0,24):'山友');
  if(changed)notifyAccountChange();
}

function prepareLocalIdentity(nextOwner:string):boolean {
  const previous=String(uni.getStorageSync('he_openid')||'');
  if(previous===nextOwner)return false;
  try{stopLocationUpdates();}catch{}try{stopCompass();}catch{}try{stopBackgroundRecording();}catch{}
  try{uni.removeStorageSync('he_team');}catch{try{uni.setStorageSync('he_team','');}catch{}}
  // A successful sync to another account is not a sync to this account.
  const canRewriteTrackStore=trackStorageValid();
  listTracks().filter(track=>track.cloudOwner&&track.cloudOwner!==nextOwner).forEach(track=>{
    if(track.synced&&canRewriteTrackStore){try{saveTrack({...track,synced:false});}catch{/* Keep the track and continue the identity change safely. */}}
    try{setTrackAutoSyncExcluded(track.id,true,nextOwner);}catch{/* Per-account exclusion is best-effort; never block login. */}
  });
  return true;
}
// Compare without accountSession(): checking a delayed response must not
// expire or otherwise mutate the newly selected session.
function stillCurrentSession(expected:AccountSession|null):boolean {
  if(!expected)return false;
  try {
    const raw=uni.getStorageSync(SESSION_KEY);
    const current=typeof raw==='string'?JSON.parse(raw):raw;
    return current?.token===expected.token && current?.openid===expected.openid;
  } catch { return false; }
}
export async function accountRequest<T>(action: string, data: Record<string, unknown> = {}): Promise<AccountResponse<T>> {
  if (!accountApiConfigured()) return { ok: false, errMsg: '账号服务尚未配置，请稍后使用' };
  const session = accountSession();
  // #ifdef MP-WEIXIN
  try {
    wx.cloud.init({env:CLOUD_ENV,traceUser:false});
    if(typeof wx.cloud.callHTTPFunction!=='function')return {ok:false,errMsg:'请升级微信后使用云端账号服务（基础库需3.15.1及以上）'};
    const response:any = await new Promise((resolve,reject)=>wx.cloud.callHTTPFunction({name:'client-api',config:{env:CLOUD_ENV},path:'/',method:'post',header:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},data:{action,data},success:resolve,fail:reject}));
    const result = (typeof response.data==='string'?JSON.parse(response.data):response.data) as AccountResponse<T>;
    if(response.statusCode===401&&session&&result?.code==='SESSION_EXPIRED'&&stillCurrentSession(session))clearAccount();
    if(response.statusCode>=200&&response.statusCode<300&&result?.ok===true)return result;
    return {ok:false,errMsg:result?.errMsg||'服务未完成本次操作',code:result?.code==='TEAM_REQUEST_EXPIRED'?result.code:undefined};
  } catch (error:any) {
    const code=String(error?.errCode||error?.code||'INVALID_RESPONSE');
    console.warn('[account-cloud]',/^[A-Z0-9_.-]{1,64}$/i.test(code)?code:'REQUEST_FAILED');
    return {ok:false,errMsg:'云服务请求未完成，请确认操作结果后重试'};
  }
  // #endif
  // #ifdef H5
  if(needsGatewayRelay()){
    try{
      const response=await gatewayRelayRequest(action,data,session?.token,['gear-scan','catalog-feed'].includes(action)?60000:20000);
      const result=response.body as AccountResponse<T>;
      if(response.status===401&&session&&result?.code==='SESSION_EXPIRED'&&stillCurrentSession(session))clearAccount();
      if(response.status>=200&&response.status<300&&result?.ok===true)return result;
      return {ok:false,errMsg:result?.errMsg||'服务未完成本次操作',code:result?.code==='TEAM_REQUEST_EXPIRED'?result.code:undefined};
    }catch{return {ok:false,errMsg:'网络请求未完成，请确认操作结果后重试'};}
  }
  // #endif
  return new Promise(resolve => {
    uni.request({ url: API_URL, method: 'POST', timeout: ['gear-scan','catalog-feed'].includes(action) ? 60000 : 20000,
      header: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      data: { action, data },
      success: response => {
        const result = response.data as AccountResponse<T>;
        if (response.statusCode === 401 && session && result?.code === 'SESSION_EXPIRED' && stillCurrentSession(session)) clearAccount();
        if (response.statusCode >= 200 && response.statusCode < 300 && result?.ok === true) resolve(result);
        else resolve({ ok: false, errMsg: result?.errMsg || '服务未完成本次操作', code: result?.code === 'TEAM_REQUEST_EXPIRED' ? result.code : undefined });
      }, fail: () => resolve({ ok: false, errMsg: '网络连接失败，请稍后重试' }),
    });
  });
}
export async function signOutAccount(): Promise<AccountResponse<unknown>> {
  const session=accountSession();
  const result = await accountRequest('auth.sign-out');
  // Keep the credential until remote revocation succeeds.
  if (result.ok && stillCurrentSession(session)&&!clearAccount())return {ok:false,errMsg:'云端已退出，但本机登录状态或定位数据清理未完全确认；请重试清理并暂勿共用此设备'};
  return result;
}
