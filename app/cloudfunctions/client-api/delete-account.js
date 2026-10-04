// Resumable deletion: disable business access first, remove at most 100 records
// per request, retain a password-verified resume path until cleanup completes.
exports.deleteAccount = async (db, account, tokenHash) => {
  const ref = db.collection('client_accounts').doc(require('crypto').createHash('sha256').update(account.username).digest('hex'));
  const waiting = await db.runTransaction(async tx => {
    const currentRef = tx.collection('client_accounts').doc(require('crypto').createHash('sha256').update(account.username).digest('hex'));
    const latest = (await currentRef.get()).data;
    if (!latest || latest.disabled || latest.passwordHash !== account.passwordHash) throw new Error('Account changed during deletion');
    const operations = (latest.operations || []).filter(item => item.until > Date.now());
    if (!latest.deleting) {
      await currentRef.update({ data: { deleting: true, deletionStartedAt: Date.now(), sessionVersion: latest.sessionVersion + 1, operations } });
      await tx.collection('client_sessions').doc(tokenHash).update({ data: { sessionVersion: latest.sessionVersion + 1 } });
    }
    return operations.length > 0;
  });
  if (waiting) return { complete: false, waiting: true };
  await db.collection('team_members').where({ openid: account.identity }).update({ data: { latitude: null, longitude: null, updatedAt: 0 } });
  await db.collection('companion_posts').where({openid:account.identity}).update({data:{status:'deleting'}});
  let budget = 100;
  const ownTeams = (await db.collection('teams').where({ createdBy: account.identity, active: true }).limit(100).get()).data;
  for (const team of ownTeams) {
    await db.collection('teams').doc(team._id).update({ data: { active: false, closedAt: Date.now() } });
    await db.collection('team_members').where({ teamId: team._id }).update({ data: { latitude: null, longitude: null, updatedAt: 0 } });
    if (--budget <= 0) return { complete: false };
  }
  const membership = (await db.collection('team_members').where({ openid: account.identity }).limit(budget).get()).data;
  for (const member of membership) {
    await db.runTransaction(async tx => {
      const memberRef = tx.collection('team_members').doc(member._id);
      if (!(await memberRef.get()).data) return;
      const teamRef = tx.collection('teams').doc(member.teamId), team = (await teamRef.get()).data;
      await memberRef.remove();
      if (team && Number.isFinite(team.memberCount)) await teamRef.update({ data: { memberCount: Math.max(0, team.memberCount - 1) } });
    });
    if (--budget <= 0) return { complete: false };
  }
  // Remove participation before deleting owned posts. Version increments keep
  // existing conditional join requests from restoring the old member array.
  const participation = (await db.collection('companion_posts').where({ members: account.identity }).limit(budget).get()).data;
  for (const post of participation) {
    await db.runTransaction(async tx => {
      const postRef = tx.collection('companion_posts').doc(post._id), latest = (await postRef.get()).data;
      if (!latest) return;
      const members = (latest.members || []).filter(id => id !== account.identity);
      await postRef.update({ data: { members, joinVersion: (latest.joinVersion || 0) + 1,
        status: !['open', 'full'].includes(latest.status) ? latest.status : members.length >= latest.maxMembers ? 'full' : 'open' } });
    });
    if (--budget <= 0) return { complete: false };
  }
  for (const [collection, field] of [['user_documents','owner'], ['team_messages','owner'], ['user_notifications','owner'], ['user_libraries', 'owner'], ['tracks', 'owner'], ['sos_events', 'openid'], ['companion_posts', 'openid'], ['community_reports', 'reporter'], ['teams', 'createdBy']]) {
    const rows = (await db.collection(collection).where({ [field]: account.identity }).limit(budget).get()).data;
    for (const row of rows) {
      if(collection==='companion_posts'){const registrations=(await db.collection('user_documents').where({kind:'registration',postId:row._id}).limit(budget).get()).data;for(const registration of registrations){await db.collection('user_documents').doc(registration._id).remove();if(--budget<=0)return {complete:false};}}
      await db.collection(collection).doc(row._id).remove();
      if (--budget <= 0) return { complete: false };
    }
  }
  // Keep only a tombstone to prevent reusing the old username and identity.
  await ref.set({ data: { username: account.username, identity: account.identity, disabled: true, deletedAt: Date.now(), sessionVersion: account.sessionVersion + 1 } });
  await db.collection('client_sessions').where({ accountId: require('crypto').createHash('sha256').update(account.username).digest('hex') }).remove();
  return { complete: true };
};
