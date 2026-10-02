// team-join：凭邀请码加入队伍
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { inviteCode } = event;
  const found = await db.collection("teams").where({ inviteCode, active: true }).limit(1).get();
  if (found.data.length === 0) return { errMsg: "邀请码无效" };
  const team = found.data[0];
  const exist = await db.collection("team_members").where({ teamId: team._id, openid: OPENID }).limit(1).get();
  if (exist.data.length === 0) {
    await db.collection("team_members").add({
      data: {
        teamId: team._id, openid: OPENID, nickname: "山友",
        latitude: 0, longitude: 0, updatedAt: 0, isLeader: false,
      },
    });
  }
  return {
    team: {
      id: team._id, name: team.name, inviteCode: team.inviteCode,
      createdBy: team.createdBy, createdAt: team.createdAt, active: team.active,
    },
  };
};
