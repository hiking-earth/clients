const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
exports.main = async event => {
  const OPENID = require('../../identity').currentIdentity();
  if (!OPENID) return { errMsg: '请先登录' };
  if (event.action === 'list') {
    const page = Number.isInteger(event.page) && event.page >= 0 ? event.page : 0;
    const result = await db.collection('tracks').where({ owner: OPENID }).orderBy('syncedAt', 'desc').skip(page * 20).limit(20).field({ trackId: true, name: true, distanceM: true, syncedAt: true }).get();
    return { tracks: result.data, hasMore: result.data.length === 20 };
  }
  if (typeof event.trackId !== 'string' || !event.trackId || event.trackId.length > 128) return { errMsg: '轨迹无效' };
  const query = db.collection('tracks').where({ owner: OPENID, trackId: event.trackId });
  if (event.action === 'delete') {
    await query.remove();
    return { deleted: true };
  }
  if (event.action === 'get') {
    const { data } = await query.orderBy('syncedAt', 'desc').limit(1).get();
    if (!data.length) return { errMsg: '云端轨迹不存在' };
    const t = data[0];
    return { track: { id: t.trackId, name: t.name, routeId: t.routeId, points: t.points, distanceM: t.distanceM, ascentM: t.ascentM,
      descentM: t.descentM ?? 0, activeDurationMs: t.activeDurationMs, startedAt: t.startedAt, endedAt: t.endedAt, state: 'finished', synced: true } };
  }
  return { errMsg: '操作无效' };
};
