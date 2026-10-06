import { accountSession } from './account';

export type TripPlan = { id: string; routeId: string; date: string; notes: string; packed: boolean };
export type Library = { favorites: string[]; plans: TripPlan[] };

// Keep each account's local copy separate. Older releases used one unscoped key;
// quarantine that snapshot and only expose it through an explicit user import.
const LEGACY_KEY = 'he_library_v1';
const QUARANTINE_KEY = 'he_library_legacy_unassigned_v1';
const scopedKey = (owner: string) => `he_library_v2:${owner ? encodeURIComponent(owner) : 'anonymous'}`;

export function libraryOwner(): string {
  const session = accountSession();
  if (session) return session.openid;
  // The mini-program can authenticate directly with WeChat without a unified
  // account session; preserve its own cloud-library identity as a separate bucket.
  const saved = String(uni.getStorageSync('he_openid') || '');
  return saved && saved !== 'local-mock-user' && !saved.startsWith('account:') ? saved : '';
}

function emptyLibrary(): Library { return { favorites: [], plans: [] }; }
function parseLibrary(raw: unknown): Library | null {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return {
      favorites: Array.isArray((data as any).favorites) ? (data as any).favorites.filter((v: unknown) => typeof v === 'string' && v.length <= 128).slice(0, 200) : [],
      plans: Array.isArray((data as any).plans) ? (data as any).plans.filter((p: any) => p && typeof p.id === 'string' && p.id.length <= 128
        && typeof p.routeId === 'string' && p.routeId.length <= 128 && typeof p.notes === 'string' && p.notes.length <= 2000
        && typeof p.date === 'string' && typeof p.packed === 'boolean').slice(0, 100) : [],
    };
  } catch { return null; }
}
function quarantineLegacyLibrary(): void {
  try {
    const old = uni.getStorageSync(LEGACY_KEY);
    if (!old || uni.getStorageSync(QUARANTINE_KEY)) return;
    const parsed = parseLibrary(old);
    if (!parsed) return;
    uni.setStorageSync(QUARANTINE_KEY, JSON.stringify(parsed));
    uni.removeStorageSync(LEGACY_KEY);
  } catch { /* Preserve the old key if storage cannot safely copy it. */ }
}
function readAt(key: string): Library {
  const parsed = parseLibrary(uni.getStorageSync(key));
  return parsed || emptyLibrary();
}

export function readLibrary(): Library {
  quarantineLegacyLibrary();
  return readAt(scopedKey(libraryOwner()));
}
export function writeLibrary(data: Library): void {
  quarantineLegacyLibrary();
  const parsed = parseLibrary(data);
  if (!parsed) throw new Error('本机收藏与行程格式无效');
  uni.setStorageSync(scopedKey(libraryOwner()), JSON.stringify(parsed));
}
export function legacyLibrary(): Library | null {
  quarantineLegacyLibrary();
  if (!uni.getStorageSync(QUARANTINE_KEY)) return null;
  return readAt(QUARANTINE_KEY);
}
/** Explicitly merge the unassigned pre-account library into the currently selected local account. */
export function importLegacyLibrary(): { favorites: number; plans: number } {
  const legacy = legacyLibrary();
  if (!legacy) return { favorites: 0, plans: 0 };
  const current = readLibrary();
  const favorites = [...new Set([...current.favorites, ...legacy.favorites])];
  const plans = [...current.plans];
  const planIds = new Set(plans.map(plan => plan.id));
  for (const plan of legacy.plans) {
    if (!planIds.has(plan.id)) { plans.push(plan); planIds.add(plan.id); }
  }
  if (favorites.length > 200 || plans.length > 100) throw new Error('合并后收藏或行程超过本机上限，请先整理当前资料');
  writeLibrary({ favorites, plans });
  // Remove the quarantined snapshot only after the scoped write succeeds.
  uni.removeStorageSync(QUARANTINE_KEY);
  return { favorites: legacy.favorites.length, plans: legacy.plans.length };
}

/** Move a deleted account's local-only library into the existing unassigned
 * archive so its owner can explicitly recover it under a later identity. */
export function archiveDeletedAccountLibrary(owner: string): { status: 'archived' | 'empty' | 'failed'; favorites: number; plans: number } {
  if (!owner || owner === 'anonymous') return { status: 'failed', favorites: 0, plans: 0 };
  const sourceKey = scopedKey(owner);
  try {
    const raw = uni.getStorageSync(sourceKey);
    if (!raw) return { status: 'empty', favorites: 0, plans: 0 };
    const source = parseLibrary(raw);
    if (!source) return { status: 'failed', favorites: 0, plans: 0 };
    const existingRaw = uni.getStorageSync(QUARANTINE_KEY);
    const existing = existingRaw ? parseLibrary(existingRaw) : emptyLibrary();
    if (!existing) return { status: 'failed', favorites: 0, plans: 0 };
    const merged: Library = {
      favorites: [...new Set([...existing.favorites, ...source.favorites])],
      plans: [...existing.plans],
    };
    const planIds = new Set(merged.plans.map(plan => plan.id));
    for (const plan of source.plans) if (!planIds.has(plan.id)) { merged.plans.push(plan); planIds.add(plan.id); }
    if (merged.favorites.length > 200 || merged.plans.length > 100) return { status: 'failed', favorites: 0, plans: 0 };
    const serialized = JSON.stringify(merged);
    uni.setStorageSync(QUARANTINE_KEY, serialized);
    if (JSON.stringify(parseLibrary(uni.getStorageSync(QUARANTINE_KEY))) !== serialized) return { status: 'failed', favorites: 0, plans: 0 };
    uni.removeStorageSync(sourceKey);
    return { status: 'archived', favorites: source.favorites.length, plans: source.plans.length };
  } catch { return { status: 'failed', favorites: 0, plans: 0 }; }
}

export function toggleFavorite(id: string): boolean {
  const data = readLibrary(), exists = data.favorites.includes(id);
  data.favorites = exists ? data.favorites.filter(x => x !== id) : [...data.favorites, id];
  if (data.favorites.length > 200) throw new Error('最多收藏200条路线');
  writeLibrary(data); return !exists;
}
export function libraryVersion(): number { return Number(uni.getStorageSync(`he_library_version:${libraryOwner()}`) || 0); }
export function setLibraryVersion(version: number, snapshot: Library = readLibrary()): void {
  const owner = libraryOwner();
  if (!owner) throw new Error('请先登录统一账号');
  uni.setStorageSync(`he_library_version:${owner}`, version);
  uni.setStorageSync(`he_library_baseline:${owner}`, JSON.stringify(snapshot));
}

/** Validate a cloud snapshot before replacing any local library data. */
export function validCloudLibrary(value: unknown): value is Library & { version: number } {
  const row = value as any;
  return !!row && Number.isSafeInteger(row.version) && row.version >= 0
    && Array.isArray(row.favorites) && row.favorites.length <= 200
    && row.favorites.every((id: unknown) => typeof id === 'string' && id.length <= 128)
    && Array.isArray(row.plans) && row.plans.length <= 100
    && row.plans.every((plan: any) => !!plan && typeof plan.id === 'string' && plan.id.length <= 128
      && typeof plan.routeId === 'string' && plan.routeId.length <= 128
      && typeof plan.notes === 'string' && plan.notes.length <= 2000 && typeof plan.packed === 'boolean'
      && typeof plan.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(plan.date)
      && Number.isFinite(Date.parse(plan.date)) && new Date(plan.date).toISOString().slice(0, 10) === plan.date);
}
