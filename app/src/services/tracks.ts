/**
 * 本地轨迹存储（个保法：轨迹本地优先，云同步需用户手动触发）
 */
import type { TrackRecord } from "@shared/types/track";
import { validTrackPoint } from "@shared/types/track";
import { accountSession } from "@/services/account";
import { hasPrivacyConsent } from "@/services/privacy";
import { callCloud } from "@/services/cloud";

const KEY = "he_tracks_v1";

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
export async function uploadTrackToCloud(track:TrackRecord):Promise<TrackUploadResult>{
  if(!hasPrivacyConsent('trackCloudSync'))return {ok:false,errMsg:'未启用轨迹云备份授权'};
  if(track.state!=='finished'||!validRecord(track))return {ok:false,errMsg:'仅可同步格式有效的已完成轨迹'};
  if(trackUploads.has(track.id))return {ok:false,errMsg:'该轨迹正在同步'};
  const expectedVersion=track.cloudVersion??0;
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)return {ok:false,errMsg:'本机轨迹云端版本无效，请恢复云端副本'};
  const session=accountSession();
  const identity=session?.openid||String(uni.getStorageSync('he_openid')||'');
  const token=session?.token||'';
  if(!identity)return {ok:false,errMsg:'请先登录统一账号'};
  if(JSON.stringify(getTrack(track.id))!==JSON.stringify(track))return {ok:false,errMsg:'本机轨迹已变化，请刷新后重试'};
  trackUploads.add(track.id);
  try{
    const response=await callCloud<{synced:boolean;version:number}>('track-sync',{track,expectedVersion});
    const latestSession=accountSession();
    const latestIdentity=latestSession?.openid||String(uni.getStorageSync('he_openid')||'');
    if(latestIdentity!==identity||(token&&latestSession?.token!==token)||!hasPrivacyConsent('trackCloudSync'))return {ok:false,errMsg:'账号或轨迹备份授权已变化，轨迹仍保留在本机'};
    if(!response.ok||response.data?.synced!==true||response.data.version!==expectedVersion+1)
      return {ok:false,errMsg:response.errMsg||'云端版本冲突或未确认；请从云端恢复最新副本后再同步'};
    if(JSON.stringify(getTrack(track.id))!==JSON.stringify(track))return {ok:false,errMsg:'同步期间本机轨迹已变化，云端回执未应用到本机'};
    markSynced(track.id,response.data.version);return {ok:true};
  }catch{return {ok:false,errMsg:'云端未确认轨迹同步，轨迹仍保留待重试'};}finally{trackUploads.delete(track.id);}
}

export function markSynced(id: string, cloudVersion:number): void {
  const t = getTrack(id);
  if (t && Number.isSafeInteger(cloudVersion) && cloudVersion>=1) {saveTrack({ ...t, synced: true, cloudVersion });setTrackAutoSyncExcluded(id,false); }
}

// 恢复时只恢复为暂停；不得在启动应用时自动取得定位权限。
const DRAFT_KEY = "he_track_draft_v1";
export function saveDraft(track: TrackRecord): void {
  if (!validRecord(track)) throw new Error("轨迹草稿格式无效，未保存");
  uni.setStorageSync(DRAFT_KEY, JSON.stringify(track));
}
export function loadDraft(): TrackRecord | null {
  try {
    const raw = uni.getStorageSync(DRAFT_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (!validRecord(t)) return null;
    // A completed local save takes precedence over a stale draft left by cleanup failure.
    if (getTrack(t.id)?.state === "finished") return null;
    return { ...t, state: "paused", synced: false };
  } catch { return null; }
}
export function clearDraft(): void { uni.removeStorageSync(DRAFT_KEY); }

function validRecord(t: any): t is TrackRecord {
  const validTime = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 8640000000000000;
  return !!t && typeof t.id === "string" && !!t.id.trim() && typeof t.name === "string" && Array.isArray(t.points)
    && validTime(t.startedAt) && (t.endedAt === undefined || (validTime(t.endedAt) && t.endedAt >= t.startedAt))
    && [t.distanceM, t.ascentM, t.descentM].every(value => Number.isFinite(value) && value >= 0)
    && (t.activeDurationMs === undefined || (Number.isFinite(t.activeDurationMs) && t.activeDurationMs >= 0))
    && ['recording', 'paused', 'finished'].includes(t.state) && typeof t.synced === 'boolean'
    && (t.cloudVersion===undefined || (Number.isSafeInteger(t.cloudVersion) && t.cloudVersion>=0))
    && (t.routeId === undefined || typeof t.routeId === 'string')
    && t.points.every(validTrackPoint);
}

// A local deletion remains local, including when automatic cloud restore runs.
export function trackAutoSyncExcluded(id:string):boolean {
  const owner=String(uni.getStorageSync('he_openid')||'');
  const items=uni.getStorageSync(`he_track_sync_excluded:${owner}`);
  return Array.isArray(items)&&items.includes(id);
}
export function setTrackAutoSyncExcluded(id:string,value:boolean):void {
  const owner=String(uni.getStorageSync('he_openid')||'');
  const key=`he_track_sync_excluded:${owner}`;const raw=uni.getStorageSync(key);
  const items=new Set<string>(Array.isArray(raw)?raw:[]);
  if(value)items.add(id);else items.delete(id);uni.setStorageSync(key,[...items]);
}
export function hasRecordingDraft():boolean {
  try {const raw=uni.getStorageSync(DRAFT_KEY);const track=typeof raw==='string'?JSON.parse(raw):raw;return validRecord(track)&&track.state==='recording';}catch{return false;}
}
