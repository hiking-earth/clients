const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  const admins = String(process.env.HIKING_ADMIN_IDENTITIES || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!OPENID || !admins.includes(OPENID)) return { errMsg: '当前账号没有社区管理权限' };
  if (event.action === 'list') {
    const result = await db.collection('community_reports').where({ status: 'pending' }).orderBy('createdAt', 'asc').limit(50).get();
    const reports = [];
    for (const row of result.data) {
      const post = (await db.collection('companion_posts').doc(row.postId).get()).data;
      reports.push({ id: row._id, postId: row.postId, reason: row.reason, createdAt: row.createdAt,
        post: post ? { title: post.title, content: post.content, nickname: post.nickname, status: post.status } : null });
    }
    const pending = (await db.collection('companion_posts').where({ status: 'pending' }).orderBy('createdAt', 'asc').limit(50).get()).data;
    return { reports, posts: pending.map(p => ({ id: p._id, title: p.title, content: p.content, nickname: p.nickname, createdAt: p.createdAt, version: p.joinVersion || 0 })) };
  }
  if (['approve', 'reject'].includes(event.action) && typeof event.postId === 'string') {
    return db.runTransaction(async tx => {
      const ref = tx.collection('companion_posts').doc(event.postId), post = (await ref.get()).data;
      if (!post || post.status !== 'pending' || (post.joinVersion || 0) !== event.version) return { errMsg: '帖子已改变，请刷新' };
      const status = event.action === 'reject' ? 'hidden' : post.pendingDesiredStatus === 'closed' ? 'closed' : (post.members || []).length >= post.maxMembers ? 'full' : 'open';
      await ref.update({ data: { status, moderatedAt: Date.now(), moderatedBy: OPENID, joinVersion: (post.joinVersion || 0) + 1 } });
      return { handled: true };
    });
  }
  if (!['dismiss', 'hide'].includes(event.action) || typeof event.reportId !== 'string' || !event.reportId) return { errMsg: '操作无效' };
  return db.runTransaction(async tx => {
    const ref = tx.collection('community_reports').doc(event.reportId), report = (await ref.get()).data;
    if (!report) return { errMsg: '举报不存在' };
    if (report.status !== 'pending') return { errMsg: '该举报已经处理，请刷新' };
    if (event.action === 'hide') {
      const postRef = tx.collection('companion_posts').doc(report.postId), post = (await postRef.get()).data;
      if (post) await postRef.update({ data: { status: 'hidden', joinVersion: (post.joinVersion || 0) + 1, moderatedAt: Date.now() } });
    }
    await ref.update({ data: { status: event.action === 'hide' ? 'hidden' : 'dismissed', handledBy: OPENID, handledAt: Date.now() } });
    return { handled: true };
  });
};
