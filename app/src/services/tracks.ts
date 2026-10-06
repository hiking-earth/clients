/**
 * 本地轨迹存储（个保法：轨迹本地优先，云同步需用户手动触发）
 */
import type { TrackRecord } from "@shared/types/track";
import { validTrackPoint } from "@shared/types/track";
import { accountSession } from "@/services/account";
import { hasPrivacyConsent } from "@/services/privacy";
import { callCloud } from "@/services/cloud";

const KEY = "he_tracks_v1";

/** The current account identity used to bind a new local track. */
export function currentTrackOwner(): string {
  const session = accountSession();
  if (session) return session.openid;
  const saved = String(uni.getStorageSync('he_openid') || '');
  return saved && saved !== 'local-mock-user' && !saved.startsWith('account:') ? saved : '';
}

/** Anonymous work stays in its own local partition; authenticated accounts never see it by default. */
export function currentLocalTrackOwner(): string { return currentTrackOwner() || 'anonymous'; }

export function listTracks(): TrackRecord[] {
  try {
    const raw = uni.getStorageSync(KEY);
    const all = raw ? JSON.parse(raw) : [];
    return Array.isArray(all) ? all.filter(validRecord) : [];
  } catch {
    return [];
  }
}

export function getTrack(id: string): TrackRecord | null {
  return listTracks().find((t) => t.id === id) ?? null;
}

export function listCurrentOwnerTracks(): TrackRecord[] {
  const owner=currentLocalTrackOwner();
  return listTracks().filter(track=>track.localOwner===owner);
}

export function getCurrentOwnerTrack(id:string): TrackRecord|null {
  const track=getTrack(id);
  return track?.localOwner===currentLocalTrackOwner()?track:null;
}

/** A local copy needs review if it is unsynced, has unknown ownership, or is tied to another account. */
export function trackNeedsManualBackup(track: TrackRecord, owner = currentTrackOwner()): boolean {
  return !track.synced || track.localOwner !== owner || (track.synced && !track.cloudOwner);
}

export function saveTrack(track: TrackRecord): void {
  if (!validRecord(track)) throw new Error("轨迹格式无效，未保存");
  const all = listTracks();
  const idx = all.findIndex((t) => t.id === track.id);
  if (idx >= 0) all[idx] = track;
  else all.unshift(track);
  uni.setStorageSync(KEY, JSON.stringify(all));
}

export function deleteTrack(id: string): void {
  setTrackAutoSyncExcluded(id, true);
  uni.setStorageSync(KEY, JSON.stringify(listTracks().filter((t) => t.id !== id)));
}

const trackUploads = new Set<string>();
export type TrackUploadResult = { ok: true } | { ok: false; errMsg: string };
export async function uploadTrackToCloud(track:TrackRecord,options:{restoreDeleted?:boolean;transferAccount?:boolean}={}):Promise<TrackUploadResult>{
  if(!hasPrivacyConsent('trackCloudSync'))return {ok:false,errMsg:'未启用轨迹云备份授权'};
  if(track.state!=='finished'||!validRecord(track))return {ok:false,errMsg:'仅可同步格式有效的已完成轨迹'};
  if(trackUploads.has(track.id))return {ok:false,errMsg:'该轨迹正在同步'};
  const session=accountSession();
  const identity=currentTrackOwner();
  const token=session?.token||'';
  if(!identity)return {ok:false,errMsg:'请先登录统一账号'};
  if(track.localOwner!==identity&&!options.transferAccount)return {ok:false,errMsg:track.localOwner?'该轨迹属于其他本机账号，请确认后手动转存':'该旧版轨迹未记录账号归属，请确认后手动转入当前账号'};
  if(track.cloudOwner&&track.cloudOwner!==identity&&!options.transferAccount)return {ok:false,errMsg:'该轨迹属于其他账号，请在确认转存后手动同步'};
  const expectedVersion=track.cloudOwner&&track.cloudOwner!==identity?0:track.cloudVersion??0;
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)return {ok:false,errMsg:'本机轨迹云端版本无效，请恢复云端副本'};
  if(JSON.stringify(getTrack(track.id))!==JSON.stringify(track))return {ok:false,errMsg:'本机轨迹已变化，请刷新后重试'};
  trackUploads.add(track.id);
  try{
    const response=await callCloud<{synced:boolean;version:number}>('track-sync',{track,expectedVersion,restoreDeleted:options.restoreDeleted===true});
    const latestSession=accountSession();
    const latestIdentity=currentTrackOwner();
    if(latestIdentity!==identity||(token&&latestSession?.token!==token)||!hasPrivacyConsent('trackCloudSync'))return {ok:false,errMsg:'账号或轨迹备份授权已变化，轨迹仍保留在本机'};
    if(!response.ok||response.data?.synced!==true||response.data.version!==expectedVersion+1)
      return {ok:false,errMsg:response.errMsg||'云端版本冲突或未确认；请从云端恢复最新副本后再同步'};
    if(JSON.stringify(getTrack(track.id))!==JSON.stringify(track))return {ok:false,errMsg:'同步期间本机轨迹已变化，云端回执未应用到本机'};
    markSynced(track.id,response.data.version,identity);return {ok:true};
  }catch{return {ok:false,errMsg:'云端未确认轨迹同步，轨迹仍保留待重试'};}finally{trackUploads.delete(track.id);}
}

export function markSynced(id: string, cloudVersion:number, cloudOwner:string): void {
  const t = getTrack(id);
  if (t && Number.isSafeInteger(cloudVersion) && cloudVersion>=1 && typeof cloudOwner==='string' && cloudOwner.length>0) {saveTrack({ ...t, synced: true, localOwner:cloudOwner, cloudVersion, cloudOwner });setTrackAutoSyncExcluded(id,false); }
}

// 恢复时只恢复为暂停；不得在启动应用时自动取得定位权限。
const LEGACY_DRAFT_KEY = "he_track_draft_v1";
const draftKey=(owner=currentLocalTrackOwner())=>`he_track_draft_v2:${encodeURIComponent(owner)}`;
function readOwnedDraft(owner=currentLocalTrackOwner(),migrateLegacy=true):any|null{
  const current=uni.getStorageSync(draftKey(owner));if(current)return typeof current==='string'?JSON.parse(current):current;
  const legacy=uni.getStorageSync(LEGACY_DRAFT_KEY);if(!legacy)return null;
  const value=typeof legacy==='string'?JSON.parse(legacy):legacy;
  if(!validRecord(value)||value.localOwner!==owner)return null;
  if(migrateLegacy){uni.setStorageSync(draftKey(owner),JSON.stringify(value));uni.removeStorageSync(LEGACY_DRAFT_KEY);}
  return value;
}
export function saveDraft(track: TrackRecord): void {
  if (!validRecord(track)) throw new Error("轨迹草稿格式无效，未保存");
  const owner=track.localOwner||'anonymous';
  uni.setStorageSync(draftKey(owner), JSON.stringify(track));
}
export function loadDraft(): TrackRecord | null {
  try {
    const t=readOwnedDraft();
    if (!validRecord(t)) return null;
    if (t.localOwner!==currentLocalTrackOwner()) return null;
    // A completed local save takes precedence over a stale draft left by cleanup failure.
    if (getTrack(t.id)?.state === "finished") return null;
    return { ...t, state: "paused", synced: false };
  } catch { return null; }
}
/** Legacy drafts without an owner stay hidden until the user explicitly claims them. */
export function hasUnassignedDraft():boolean {
  try{const raw=uni.getStorageSync(LEGACY_DRAFT_KEY);if(!raw)return false;const t=typeof raw==='string'?JSON.parse(raw):raw;return validRecord(t)&&(!t.localOwner||t.localOwner==='anonymous')&&getTrack(t.id)?.state!=='finished';}catch{return false;}
}
export function claimUnassignedDraft(expectedOwner=currentLocalTrackOwner()):boolean {
  if(expectedOwner!==currentLocalTrackOwner())return false;
  try{const raw=uni.getStorageSync(LEGACY_DRAFT_KEY);if(!raw)return false;const t=typeof raw==='string'?JSON.parse(raw):raw;if(!validRecord(t)||(t.localOwner&&t.localOwner!=='anonymous')||getTrack(t.id)?.state==='finished')return false;
    uni.setStorageSync(draftKey(expectedOwner),JSON.stringify({...t,localOwner:expectedOwner,state:'paused',synced:false}));uni.removeStorageSync(LEGACY_DRAFT_KEY);return true;
  }catch{return false;}
}
export function clearDraft(): void {
  const owner=currentLocalTrackOwner();uni.removeStorageSync(draftKey(owner));
  try{const raw=uni.getStorageSync(LEGACY_DRAFT_KEY);const value=typeof raw==='string'?JSON.parse(raw):raw;if(value?.localOwner===owner)uni.removeStorageSync(LEGACY_DRAFT_KEY);}catch{}
}

function validRecord(t: any): t is TrackRecord {
  const validTime = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 8640000000000000;
  return !!t && typeof t.id === "string" && !!t.id.trim() && typeof t.name === "string" && Array.isArray(t.points)
    && validTime(t.startedAt) && (t.endedAt === undefined || (validTime(t.endedAt) && t.endedAt >= t.startedAt))
    && [t.distanceM, t.ascentM, t.descentM].every(value => Number.isFinite(value) && value >= 0)
    && (t.activeDurationMs === undefined || (Number.isFinite(t.activeDurationMs) && t.activeDurationMs >= 0))
    && ['recording', 'paused', 'finished'].includes(t.state) && typeof t.synced === 'boolean'
    && (t.cloudVersion===undefined || (Number.isSafeInteger(t.cloudVersion) && t.cloudVersion>=0))
    && (t.localOwner===undefined || (typeof t.localOwner==='string' && t.localOwner.length>0 && t.localOwner.length<=128))
    && (t.cloudOwner===undefined || (typeof t.cloudOwner==='string' && t.cloudOwner.length>0 && t.cloudOwner.length<=128))
    && (t.routeId === undefined || typeof t.routeId === 'string')
    && t.points.every(validTrackPoint);
}

// A local deletion remains local, including when automatic cloud restore runs.
export function trackAutoSyncExcluded(id:string):boolean {
  const owner=currentTrackOwner();
  const items=uni.getStorageSync(`he_track_sync_excluded:${owner}`);
  return Array.isArray(items)&&items.includes(id);
}
export function setTrackAutoSyncExcluded(id:string,value:boolean,ownerOverride?:string):void {
  const owner=ownerOverride??currentTrackOwner();
  const key=`he_track_sync_excluded:${owner}`;const raw=uni.getStorageSync(key);
  const items=new Set<string>(Array.isArray(raw)?raw:[]);
  if(value)items.add(id);else items.delete(id);uni.setStorageSync(key,[...items]);
}
export function hasRecordingDraft():boolean {
  try {const track=readOwnedDraft(currentLocalTrackOwner());return validRecord(track)&&track.localOwner===currentLocalTrackOwner()&&track.state==='recording';}catch{return false;}
}
