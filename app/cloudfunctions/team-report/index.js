// team-report：上报我的实时位置（覆盖式更新，不留历史轨迹——个保法最小化）
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { teamId, latitude, longitude } = event;
  if (typeof latitude !== "number" || typeof longitude !== "number") return { errMsg: "坐标缺失" };
  const res = await db
    .collection("team_members")
    .where({ teamId, openid: OPENID })
    .update({ data: { latitude, longitude, updatedAt: Date.now() } });
  return { updated: res.stats.updated };
};
