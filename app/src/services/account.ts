import { CLIENT_API_URL } from '@shared/constants';
import { stopBackgroundRecording } from '@/services/background';
import { listTracks, saveTrack } from '@/services/tracks';
import { stopCompass, stopLocationUpdates } from '@/services/location';

export type AccountProfile = { openid: string; nickname: string; username: string };
export type AccountSession = AccountProfile & { token: string; expiresAt: number };
export type AccountResponse<T> = { ok: boolean; data?: T; errMsg?: string; code?: string };
const SESSION_KEY = 'he_account_session_v1';
const API_URL = String(import.meta.env.VITE_CLIENT_API_URL || CLIENT_API_URL).replace(/\/$/, '');
const subscribers = new Set<() => void>();

export function accountApiConfigured(): boolean { return /^https:\/\//.test(API_URL); }
export function onAccountChange(callback: () => void): () => void {
  subscribers.add(callback); return () => subscribers.delete(callback);
}
export function accountSession(): AccountSession | null {
  try {
    const raw = uni.getStorageSync(SESSION_KEY);
    if (!raw) return null;
    const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!/^[a-f0-9]{64}$/.test(session.token) || typeof session.openid !== 'string'
      || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
      clearAccount(); return null;
    }
    return session;
  } catch { clearAccount(); return null; }
}
export function clearAccount(): void {
  uni.removeStorageSync(SESSION_KEY);
  uni.removeStorageSync('he_openid');
  uni.removeStorageSync('he_nickname');
  uni.removeStorageSync('he_team');
  stopLocationUpdates(); stopCompass(); stopBackgroundRecording();
  subscribers.forEach(callback => callback());
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
  const previous = String(uni.getStorageSync('he_openid') || '');
  if (previous !== session.openid) {
    stopLocationUpdates(); stopCompass(); stopBackgroundRecording();
    uni.removeStorageSync('he_team');
    // A successful sync to another account is not a sync to this account.
    listTracks().filter(track => track.synced).forEach(track => saveTrack({ ...track, synced: false }));
  }
  uni.setStorageSync(SESSION_KEY, JSON.stringify(session));
  uni.setStorageSync('he_openid', session.openid);
  uni.setStorageSync('he_nickname', session.nickname);
  if (previous !== session.openid) subscribers.forEach(callback => callback());
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
  return new Promise(resolve => {
    uni.request({ url: API_URL, method: 'POST', timeout: ['gear-scan','catalog-feed'].includes(action) ? 60000 : 20000,
      header: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      data: { action, data },
      success: response => {
        const result = response.data as AccountResponse<T>;
        if (response.statusCode === 401 && session && result?.code === 'SESSION_EXPIRED' && stillCurrentSession(session)) clearAccount();
        if (response.statusCode >= 200 && response.statusCode < 300 && result?.ok === true) resolve(result);
        else resolve({ ok: false, errMsg: result?.errMsg || '服务未完成本次操作' });
      }, fail: () => resolve({ ok: false, errMsg: '网络连接失败，请稍后重试' }),
    });
  });
}
export async function signOutAccount(): Promise<AccountResponse<unknown>> {
  const session=accountSession();
  const result = await accountRequest('auth.sign-out');
  // Keep the credential until remote revocation succeeds.
  if (result.ok && stillCurrentSession(session)) clearAccount();
  return result;
}
