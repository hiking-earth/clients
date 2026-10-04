export type TripPlan = { id: string; routeId: string; date: string; notes: string; packed: boolean };
export type Library = { favorites: string[]; plans: TripPlan[] };
const KEY = 'he_library_v1';
export function readLibrary(): Library {
  try { const data = JSON.parse(uni.getStorageSync(KEY) || '{}');
    return { favorites: Array.isArray(data.favorites) ? data.favorites.filter((v: unknown) => typeof v === 'string') : [], plans: Array.isArray(data.plans) ? data.plans.filter((p: TripPlan) => p && typeof p.id === 'string' && typeof p.routeId === 'string' && typeof p.notes === 'string' && typeof p.date === 'string') : [] };
  } catch { return { favorites: [], plans: [] }; }
}
export function writeLibrary(data: Library): void { uni.setStorageSync(KEY, JSON.stringify(data)); }
export function toggleFavorite(id: string): boolean {
  const data = readLibrary(), exists = data.favorites.includes(id);
  data.favorites = exists ? data.favorites.filter(x => x !== id) : [...data.favorites, id];
  if (data.favorites.length > 200) throw new Error('最多收藏200条路线');
  writeLibrary(data); return !exists;
}
export function libraryVersion(): number { return Number(uni.getStorageSync(`he_library_version:${uni.getStorageSync('he_openid') || ''}`) || 0); }
export function setLibraryVersion(version: number, snapshot: Library = readLibrary()): void { const owner=uni.getStorageSync('he_openid') || '';uni.setStorageSync(`he_library_version:${owner}`, version);uni.setStorageSync(`he_library_baseline:${owner}`,JSON.stringify(snapshot)); }
