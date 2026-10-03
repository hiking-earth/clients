// team-report：上报我的实时位置（覆盖式更新，不留历史轨迹——个保法最小化）
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { errMsg: "请先在微信小程序登录" };
  const { teamId, latitude, longitude } = event;
  if (typeof teamId !== "string" || !teamId || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return { errMsg: "队伍或坐标无效" };
  const res = await db
    .collection("team_members")
    .where({ teamId, openid: OPENID })
    .update({ data: { latitude, longitude, updatedAt: Date.now() } });
  if (!res.stats.updated) return { errMsg: "不在此队伍中，位置未上报" };
  return { updated: res.stats.updated };
};
