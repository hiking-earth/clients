// track-sync：轨迹云同步（用户手动触发；轨迹属敏感个人信息，仅本人可读）
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const OPENID = require('../../identity').currentIdentity();
  if (!OPENID) return { errMsg: "请先在微信小程序登录" };
  const { track } = event;
  if (!track || typeof track.id !== "string" || track.id.length > 128 || !track.id || !Array.isArray(track.points) || track.points.length < 2 || track.points.length > 20000) return { errMsg: "轨迹须包含 2 至 20000 个点" };
  const validPoint = p => p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 && Number.isFinite(p.timestamp) && p.timestamp > 0 && p.timestamp <= 8640000000000000;
  if (!track.points.every(validPoint)) return { errMsg: "轨迹包含无效坐标或时间" };
  const nonNegative = n => Number.isFinite(n) && n >= 0 ? n : 0;
  const points = track.points.map(p => ({ latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp,
    ...(Number.isFinite(p.altitude) ? { altitude: p.altitude } : {}),
    ...(p.segmentStart ? { segmentStart: true } : {}),
    ...(p.timeEstimated ? { timeEstimated: true } : {}),
  }));
  // 稳定 ID 隔离账号，重复同步只覆盖自己的同一条轨迹。
  const id = require("crypto").createHash("sha256").update(JSON.stringify([OPENID, track.id])).digest("hex");
  await db.collection("tracks").doc(id).set({ data: {
    owner: OPENID, trackId: track.id, name: String(track.name ?? "").slice(0, 60),
    routeId: typeof track.routeId === "string" ? track.routeId.slice(0, 128) : "", points,
    distanceM: nonNegative(track.distanceM), ascentM: nonNegative(track.ascentM), descentM: nonNegative(track.descentM),
    activeDurationMs: nonNegative(track.activeDurationMs), startedAt: nonNegative(track.startedAt), endedAt: nonNegative(track.endedAt), syncedAt: Date.now(),
  } });
  return { synced: true };
};
