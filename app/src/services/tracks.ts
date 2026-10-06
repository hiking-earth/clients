/**
 * 本地轨迹存储（个保法：轨迹本地优先，云同步需用户手动触发）
 */
import type { TrackRecord } from "@shared/types/track";

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

export function markSynced(id: string): void {
  const t = getTrack(id);
  if (t) {saveTrack({ ...t, synced: true });setTrackAutoSyncExcluded(id,false); }
}

// 恢复时只恢复为暂停；不得在启动应用时自动取得定位权限。
const DRAFT_KEY = "he_track_draft_v1";
export function saveDraft(track: TrackRecord): void {
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
  return t && typeof t.id === "string" && typeof t.name === "string" && Array.isArray(t.points)
    && [t.startedAt, t.distanceM, t.ascentM, t.descentM].every(Number.isFinite)
    && t.points.every((p: any) => p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 && Number.isFinite(p.timestamp));
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
