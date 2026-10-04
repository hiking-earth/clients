// companion-create：发约伴帖。先过微信内容安全机审，再入库。
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const OPENID = require('../../identity').currentIdentity();
  if (!OPENID) return { errMsg: "请先在微信小程序登录" };
  const { title = "", content = "", departDate = "", maxMembers = 4, routeId = "", nickname = "山友" } = event;

  if (typeof title !== "string" || !title.trim() || title.length > 60 || typeof content !== "string" || !content.trim() || content.length > 1000) return { errMsg: "标题须为 1–60 字，内容须为 1–1000 字" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departDate) || Number.isNaN(Date.parse(departDate)) || new Date(departDate).toISOString().slice(0, 10) !== departDate) return { errMsg: "请填写有效出发日期" };
  if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 50) return { errMsg: "人数须为 2–50 的整数" };
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
