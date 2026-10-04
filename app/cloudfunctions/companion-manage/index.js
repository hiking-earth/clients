const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { errMsg: '请先登录' };
  if (typeof event.postId !== 'string' || !event.postId) return { errMsg: '帖子无效' };
  const actions = ['leave', 'close', 'reopen', 'delete', 'edit'];
  if (!actions.includes(event.action)) return { errMsg: '操作无效' };
  let edits;
  if (event.action === 'edit') {
    const { title, content, departDate, maxMembers } = event;
    if (typeof title !== 'string' || !title.trim() || title.length > 60 || typeof content !== 'string' || !content.trim() || content.length > 1000) return { errMsg: '标题和内容长度不符合要求' };
    if (typeof departDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(departDate) || Number.isNaN(Date.parse(departDate)) || new Date(departDate).toISOString().slice(0, 10) !== departDate) return { errMsg: '出发日期无效' };
    if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 50) return { errMsg: '人数须为2–50的整数' };
    const prior = (await db.collection('companion_posts').doc(event.postId).get()).data;
    if (!prior || prior.openid !== OPENID) return { errMsg: '只能编辑自己发布的帖子' };
    if (!OPENID.startsWith('account:')) try { await cloud.openapi.security.msgSecCheck({ content: `${title}\n${content}` }); }
    catch { return { errMsg: '内容未通过审核，请修改后再提交' }; }
    edits = { title: title.trim(), content: content.trim(), departDate, maxMembers, routeId: String(event.routeId || '').slice(0, 120) };
  }
  return db.runTransaction(async tx => {
    const ref = tx.collection('companion_posts').doc(event.postId);
    const post = (await ref.get()).data;
    if (!post || post.status === 'deleted' || post.status === 'hidden') return { errMsg: '帖子已删除或不存在' };
    const members = Array.isArray(post.members) ? post.members : [];
    const owner = post.openid === OPENID;
    const version = (post.joinVersion || 0) + 1;
    if (event.action === 'leave') {
      if (owner) return { errMsg: '发起人请关闭或删除活动' };
      const remaining = members.filter(id => id !== OPENID);
      await ref.update({ data: { members: remaining, _members_count: remaining.length, joinVersion: version,
        status: post.status === 'closed' ? 'closed' : remaining.length >= post.maxMembers ? 'full' : 'open' } });
      return { left: true };
    }
    if (!owner) return { errMsg: '仅发起人可以管理该活动' };
    if (post.status === 'pending' && ['close', 'reopen'].includes(event.action)) return { errMsg: '请等待审核完成，或删除活动' };
    if (event.action === 'edit' && edits.maxMembers < members.length) return { errMsg: '人数上限不能少于已报名人数' };
    const status = event.action === 'delete' ? 'deleted' : event.action === 'edit' && OPENID.startsWith('account:') ? 'pending' : event.action === 'close' ? 'closed'
      : event.action === 'edit' && post.status === 'closed' ? 'closed'
      : members.length >= (edits?.maxMembers || post.maxMembers) ? 'full' : 'open';
    await ref.update({ data: { ...edits, status, ...(status === 'pending' ? { pendingDesiredStatus: post.status === 'closed' ? 'closed' : post.pendingDesiredStatus || 'open' } : {}), joinVersion: version, updatedAt: Date.now(),
      ...(event.action === 'delete' ? { title: '', content: '', members: [], nickname: '', routeId: '', deletedAt: Date.now() } : {}) } });
    return { updated: true, status };
  });
};
