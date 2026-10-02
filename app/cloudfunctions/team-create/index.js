// team-create / team-join：队伍创建与加入（6 位邀请码）
// team-report / team-locations：成员位置上报与查询（敏感个人信息，仅存最新位置，不留历史）
// 本文件是 team-create
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const inviteCode = String(Math.floor(100000 + Math.random() * 900000));
  const team = {
    name: String(event.name || "徒步小队").slice(0, 20),
    inviteCode,
    createdBy: OPENID,
    createdAt: Date.now(),
    active: true,
  };
  const res = await db.collection("teams").add({ data: team });
  // 创建者自动入队
  await db.collection("team_members").add({
    data: {
      teamId: res._id, openid: OPENID, nickname: "山友",
      latitude: 0, longitude: 0, updatedAt: 0, isLeader: true,
    },
  });
  return { teamId: res._id, inviteCode };
};
