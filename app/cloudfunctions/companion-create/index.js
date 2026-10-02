// companion-create：发约伴帖。先过微信内容安全机审，再入库。
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { title = "", content = "", departDate = "", maxMembers = 4, routeId = "", nickname = "山友" } = event;

  // 内容安全机审：违规直接拒发
  try {
    await cloud.openapi.security.msgSecCheck({ content: `${title}\n${content}` });
  } catch (e) {
    return { errMsg: "内容未通过安全审核，请修改后再发" };
  }

  const doc = {
    openid: OPENID,
    nickname: String(nickname).slice(0, 20),
    routeId,
    title: String(title).slice(0, 60),
    content: String(content).slice(0, 1000),
    departDate,
    maxMembers: Math.min(Math.max(Number(maxMembers) || 4, 1), 50),
    members: [OPENID],
    createdAt: Date.now(),
    status: "open",
  };
  const res = await db.collection("companion_posts").add({ data: doc });
  return { id: res._id, ...doc };
};
