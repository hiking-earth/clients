// companion-join：报名约伴帖（满员拒绝）
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { postId } = event;
  const post = (await db.collection("companion_posts").doc(postId).get()).data;
  if (!post) return { errMsg: "帖子不存在" };
  if (post.members.includes(OPENID)) return { joined: true };
  if (post.members.length >= post.maxMembers) return { errMsg: "已满员" };
  const members = [...post.members, OPENID];
  await db.collection("companion_posts").doc(postId).update({
    data: {
      members,
      status: members.length >= post.maxMembers ? "full" : "open",
      _members_count: _.inc(1),
    },
  });
  return { joined: true };
};
