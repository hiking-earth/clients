// track-sync：轨迹云同步（用户手动触发；轨迹属敏感个人信息，仅本人可读）
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { track } = event;
  if (!track || !track.id || !Array.isArray(track.points)) return { errMsg: "轨迹数据不合法" };
  // 轨迹点上限保护
  const points = track.points.slice(0, 20000);
  await db.collection("tracks").add({
    data: {
      owner: OPENID,
      trackId: track.id,
      name: String(track.name ?? "").slice(0, 60),
      routeId: track.routeId ?? "",
      points,
      distanceM: Number(track.distanceM) || 0,
      ascentM: Number(track.ascentM) || 0,
      startedAt: Number(track.startedAt) || 0,
      endedAt: Number(track.endedAt) || 0,
      syncedAt: Date.now(),
    },
  });
  return { synced: true };
};
