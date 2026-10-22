const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { errMsg: "请先登录" };
  if (typeof event.postId !== "string" || !event.postId) return { errMsg: "帖子无效" };
  const reason = String(event.reason || "").trim().slice(0, 300);
  if (!reason) return { errMsg: "请填写举报原因" };
  const id = require("crypto").createHash("sha256").update(JSON.stringify([OPENID, event.postId])).digest("hex");
  await db.collection("community_reports").doc(id).set({ data: { reporter: OPENID, postId: event.postId, reason, createdAt: Date.now(), status: "pending" } });
  return { reported: true };
};
