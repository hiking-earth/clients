// companion-list：约伴帖列表（按时间倒序，取最近 50 条）
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const res = await db
    .collection("companion_posts")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return { posts: res.data.map((p) => ({ ...p, id: p._id })) };
};
