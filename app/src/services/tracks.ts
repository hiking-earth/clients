/**
 * 本地轨迹存储（个保法：轨迹本地优先，云同步需用户手动触发）
 */
import type { TrackRecord } from "@shared/types/track";

const KEY = "he_tracks_v1";

export function listTracks(): TrackRecord[] {
  try {
    const raw = uni.getStorageSync(KEY);
    return raw ? (JSON.parse(raw) as TrackRecord[]) : [];
  } catch {
    return [];
  }
}

export function getTrack(id: string): TrackRecord | null {
  return listTracks().find((t) => t.id === id) ?? null;
}

export function saveTrack(track: TrackRecord): void {
  const all = listTracks();
  const idx = all.findIndex((t) => t.id === track.id);
  if (idx >= 0) all[idx] = track;
  else all.unshift(track);
  uni.setStorageSync(KEY, JSON.stringify(all));
}

export function deleteTrack(id: string): void {
  uni.setStorageSync(KEY, JSON.stringify(listTracks().filter((t) => t.id !== id)));
}

export function markSynced(id: string): void {
  const t = getTrack(id);
  if (t) saveTrack({ ...t, synced: true });
}
