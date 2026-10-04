export type OfflineLayer = { id: string; name: string; attribution: string; license: string; savedAt: number; paths: [number, number][][]; bytes: number };
const KEY = 'he_offline_vectors_v1';
const bytesOf = (text: string) => encodeURIComponent(text).replace(/%[A-F\d]{2}|./g, 'x').length;
export function offlineLayers(): OfflineLayer[] {
  try { const value = JSON.parse(uni.getStorageSync(KEY) || '[]'); return Array.isArray(value) ? value.filter(p => p && typeof p.id === 'string' && Array.isArray(p.paths)) : []; } catch { return []; }
}
export function importOfflineLayer(text: string): OfflineLayer {
  if (bytesOf(text) > 5 * 1024 * 1024) throw new Error('离线资料最多5 MB');
  const data = JSON.parse(text);
  if (data.format !== 'hiking-earth-offline-v1' || typeof data.name !== 'string' || !data.name.trim() || typeof data.attribution !== 'string' || !data.attribution.trim() || typeof data.license !== 'string' || !data.license.trim() || data.geometry?.type !== 'FeatureCollection' || !Array.isArray(data.geometry.features)) throw new Error('资料需包含名称、来源、许可和GeoJSON FeatureCollection');
  const paths: [number, number][][] = []; let count = 0;
  const add = (line: unknown) => {
    if (!Array.isArray(line) || line.length < 2) throw new Error('线段至少需要两个点');
    const points: [number, number][] = [];
    for (const coord of line) {
      if (!Array.isArray(coord) || !Number.isFinite(coord[0]) || Math.abs(coord[0]) > 180 || !Number.isFinite(coord[1]) || Math.abs(coord[1]) > 90) throw new Error('离线资料包含无效WGS84坐标');
      if (++count > 50000) throw new Error('离线资料最多50000个点');
      points.push([coord[0], coord[1]]);
    }
    paths.push(points);
  };
  for (const feature of data.geometry.features) {
    const g = feature?.geometry;
    if (g?.type === 'LineString') add(g.coordinates);
    else if (g?.type === 'MultiLineString' || g?.type === 'Polygon') { if (!Array.isArray(g.coordinates)) throw new Error('几何数据无效'); g.coordinates.forEach(add); }
    else if (g?.type === 'MultiPolygon') { if (!Array.isArray(g.coordinates)) throw new Error('几何数据无效'); for (const polygon of g.coordinates) { if (!Array.isArray(polygon)) throw new Error('几何数据无效'); polygon.forEach(add); } }
    else throw new Error('仅支持线段与区域边界，不支持未知几何类型');
  }
  if (!paths.length) throw new Error('资料没有可显示的线段');
  const layer = { id: `offline-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, name: data.name.trim().slice(0,80), attribution: data.attribution.trim().slice(0,300), license: data.license.trim().slice(0,300), savedAt: Date.now(), paths, bytes: 0 };
  layer.bytes = bytesOf(JSON.stringify(layer));
  const all = [...offlineLayers(), layer], serialized = JSON.stringify(all);
  if (bytesOf(serialized) > 8 * 1024 * 1024) throw new Error('离线资料总量最多8 MB，请先删除不需要的资料');
  uni.setStorageSync(KEY, serialized); return layer;
}
export function deleteOfflineLayer(id: string): void {
  uni.setStorageSync(KEY, JSON.stringify(offlineLayers().filter(p => p.id !== id)));
  if (uni.getStorageSync('he_offline_active') === id) uni.removeStorageSync('he_offline_active');
}
export function activeOfflineLayer(): OfflineLayer | null {
  const id = uni.getStorageSync('he_offline_active'); return offlineLayers().find(p => p.id === id) || null;
}
export function selectOfflineLayer(id: string): void {
  if (!offlineLayers().some(p => p.id === id)) throw new Error('离线资料不存在');
  uni.setStorageSync('he_offline_active', id);
}
