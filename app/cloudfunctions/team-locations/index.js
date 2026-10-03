// team-locations：查询全队成员最新位置（仅同队成员可调）
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { errMsg: "请先在微信小程序登录" };
  const { teamId } = event;
  if (typeof teamId !== "string" || !teamId) return { errMsg: "队伍无效" };
  // 校验调用者是本队成员
  const me = await db.collection("team_members").where({ teamId, openid: OPENID }).limit(1).get();
  if (me.data.length === 0) return { errMsg: "不是本队成员" };
  const res = await db.collection("team_members").where({ teamId }).limit(100).get();
  return {
    members: res.data.map((m) => ({
      teamId: m.teamId,
      openid: m.openid,
      nickname: m.nickname,
      latitude: Date.now() - m.updatedAt <= 60000 ? m.latitude : null,
      longitude: Date.now() - m.updatedAt <= 60000 ? m.longitude : null,
      updatedAt: m.updatedAt,
      isLeader: m.isLeader,
    })),
  };
};
