// Trusted scheduled retention; not exposed by the public account gateway.
const cloud=require('wx-server-sdk');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database({throwOnNotFound:false});
exports.main=async event=>{
 const context=cloud.getWXContext();
 if(context.OPENID||event.Type!=='Timer')return {errMsg:'仅定时任务可执行'};
 const now=Date.now();let removed=0,postponed=0;
 for(const collection of ['client_sessions','client_rate_limits','client_qr_logins','client_wechat_tickets']){
  const rows=(await db.collection(collection).where({expiresAt:db.command.lte(now)}).limit(100).get()).data;
  for(const row of rows)await db.runTransaction(async tx=>{const ref=tx.collection(collection).doc(row._id);const live=(await ref.get()).data;if(live&&Number.isFinite(live.expiresAt)&&live.expiresAt<=now){await ref.remove();removed++;}});
 }
 const rows=(await db.collection('user_documents').where({kind:'registration',expiresAt:db.command.lte(now)}).limit(100).get()).data;
 for(const row of rows)await db.runTransaction(async tx=>{
  const ref=tx.collection('user_documents').doc(row._id);const live=(await ref.get()).data;
  if(!live||live.kind!=='registration'||!Number.isFinite(live.expiresAt)||live.expiresAt>now)return;
  const post=(await tx.collection('companion_posts').doc(live.postId).get()).data;
  const deadline=post?Date.parse(post.departDate+'T23:59:59+08:00')+30*86400000:0;
  if(post&&!['deleted','hidden','deleting'].includes(post.status)&&Number.isFinite(deadline)&&deadline>now){await ref.update({data:{expiresAt:deadline}});postponed++;return;}
  await ref.remove();removed++;
 });
 return {removed,postponed,checkedAt:now};
};
