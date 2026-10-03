// 使用版本条件更新，避免多人同时报名时超员或相互覆盖。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { errMsg: '请先登录' };
  if (typeof event.postId !== 'string' || !event.postId) return { errMsg: '帖子无效' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const post = (await db.collection('companion_posts').doc(event.postId).get()).data;
    if (!post) return { errMsg: '帖子不存在' };
    if (post.status === 'closed') return { errMsg: '报名已关闭' };
    if (post.members.includes(OPENID)) return { joined: true };
    if (post.members.length >= post.maxMembers) return { errMsg: '已满员' };
    const members = [...post.members, OPENID];
    const result = await db.collection('companion_posts').where({
      _id: event.postId,
      joinVersion: post.joinVersion == null ? db.command.exists(false) : post.joinVersion,
      status: post.status,
    }).update({ data: { members, status: members.length >= post.maxMembers ? 'full' : 'open', _members_count: members.length, joinVersion: (post.joinVersion ?? 0) + 1 } });
    if (result.stats.updated === 1) return { joined: true };
  }
  return { errMsg: '报名人数正在更新，请重试' };
};
