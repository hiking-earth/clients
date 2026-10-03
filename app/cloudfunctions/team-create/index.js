const cloud = require('wx-server-sdk');
const { randomInt, createHash } = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { errMsg: '请先登录' };
  for (let attempt = 0; attempt < 5; attempt++) {
    const inviteCode = String(randomInt(100000, 1000000));
    // 兼容旧版随机文档 ID 的队伍；新版使用邀请码作为唯一文档键。
    const existing = await db.collection('teams').where({ inviteCode }).limit(1).get();
    if (existing.data.length) continue;
    const teamId = `invite-${inviteCode}`;
    const memberId = createHash('sha256').update(JSON.stringify([teamId, OPENID])).digest('hex');
    let collision = false;
    await db.runTransaction(async tx => {
      collision = false;
      const prior = await tx.collection('teams').doc(teamId).get();
      if (prior.data) { collision = true; return; }
      await tx.collection('teams').doc(teamId).set({ data: { name: String(event.name || '徒步小队').slice(0, 20), inviteCode, createdBy: OPENID, createdAt: Date.now(), active: true, memberCount: 1 } });
      await tx.collection('team_members').doc(memberId).set({ data: { teamId, openid: OPENID, nickname: '山友', latitude: null, longitude: null, updatedAt: 0, isLeader: true } });
    });
    if (!collision) return { teamId, inviteCode };
  }
  return { errMsg: '邀请码生成繁忙，请重试' };
};
