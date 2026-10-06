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

/** Validate a cloud snapshot before replacing any local library data. */
export function validCloudLibrary(value:unknown):value is Library & {version:number} {
  const row=value as any;
  return !!row && Number.isSafeInteger(row.version) && row.version>=0
    && Array.isArray(row.favorites) && row.favorites.length<=200
    && row.favorites.every((id:unknown)=>typeof id==='string' && id.length<=128)
    && Array.isArray(row.plans) && row.plans.length<=100
    && row.plans.every((plan:any)=>!!plan && typeof plan.id==='string' && plan.id.length<=128
      && typeof plan.routeId==='string' && plan.routeId.length<=128
      && typeof plan.notes==='string' && plan.notes.length<=2000 && typeof plan.packed==='boolean'
      && typeof plan.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(plan.date)
      && Number.isFinite(Date.parse(plan.date)) && new Date(plan.date).toISOString().slice(0,10)===plan.date);
}
