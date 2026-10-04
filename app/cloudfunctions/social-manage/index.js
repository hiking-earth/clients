const cloud=require('wx-server-sdk');const crypto=require('crypto');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database({throwOnNotFound:false});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const text=(v,max)=>typeof v==='string' && v.trim().length>0 && v.length<=max;
const admins=()=>new Set(String(process.env.HIKING_ADMIN_IDENTITIES||'').split(',').map(x=>x.trim()).filter(Boolean));
async function member(teamId,identity,tx=db){
  const team=(await tx.collection('teams').doc(teamId).get()).data;
  const rows=(await tx.collection('team_members').where({teamId,openid:identity}).limit(1).get()).data;
  if(!team?.active || !rows.length)throw new Error('已不在有效队伍中');return team;
}
exports.main=async event=>{
 const { OPENID } = cloud.getWXContext();if(!OPENID)return {errMsg:'请先登录'};
 try {
  const action=String(event.action||'');const page=Number.isInteger(event.page)&&event.page>=0&&event.page<=1000?event.page:0;
  if(action==='comments.list'){
   if(!text(event.routeId,128))return {errMsg:'路线无效'};
   const rows=(await db.collection('user_documents').where({kind:'comment',routeId:event.routeId,status:'approved'}).orderBy('updatedAt','desc').skip(page*20).limit(20).field({body:true,nickname:true,updatedAt:true,routeId:true}).get()).data;
   return {items:rows,hasMore:rows.length===20};
  }
  if(action==='diaries.list'){
   const query=event.public?{kind:'diary',visibility:'public',status:'approved'}:{kind:'diary',owner:OPENID};
   const rows=(await db.collection('user_documents').where(query).orderBy('updatedAt','desc').skip(page*20).limit(20).get()).data;
   return {items:rows.map(({owner,...row})=>({...row,mine:owner===OPENID})),hasMore:rows.length===20};
  }
  if(action==='comments.create'||action==='diaries.save'){
   if(!text(event.id,128)||!text(event.routeId,128)||!text(event.body,5000))return {errMsg:'内容或路线格式无效'};
   const kind=action==='comments.create'?'comment':'diary';const id=hash(`${OPENID}:${kind}:${event.id}`);
   return db.runTransaction(async tx=>{
    const ref=tx.collection('user_documents').doc(id);const prior=(await ref.get()).data;
    const version=prior?.version||0;if(event.version!==version)return {errMsg:'另一端已修改，请刷新后重试'};
    const visibility=kind==='comment'?'public':event.visibility==='public'?'public':'private';
    await ref.set({data:{owner:OPENID,kind,clientId:event.id,routeId:event.routeId,title:String(event.title||'').slice(0,100),body:event.body.trim(),nickname:String(event.nickname||'徒步用户').slice(0,40),visibility,status:visibility==='public'?'pending':'private',checkedIn:!!event.checkedIn,version:version+1,createdAt:prior?.createdAt||Date.now(),updatedAt:Date.now()}});
    return {id,version:version+1,status:visibility==='public'?'pending':'private'};
   });
  }
  if(action==='documents.remove'){
   if(!text(event.id,128))return {errMsg:'记录无效'};
   return db.runTransaction(async tx=>{const ref=tx.collection('user_documents').doc(event.id);const row=(await ref.get()).data;if(!row||row.owner!==OPENID)return {errMsg:'无权删除记录'};await ref.remove();return {deleted:true};});
  }
  if(action==='messages.list'){
   if(!text(event.teamId,128))return {errMsg:'队伍无效'};await member(event.teamId,OPENID);
   const rows=(await db.collection('team_messages').where({teamId:event.teamId}).orderBy('createdAt','desc').skip(page*30).limit(30).get()).data;
   // Re-check membership after the read so revoked members do not receive a fresh page.
   await member(event.teamId,OPENID);
   return {items:rows.map(({owner,...row})=>({...row,mine:owner===OPENID})),hasMore:rows.length===30};
  }
  if(action==='messages.send'){
   if(!text(event.teamId,128)||!text(event.id,128)||!text(event.body,1000))return {errMsg:'消息格式无效'};
   return db.runTransaction(async tx=>{
    await member(event.teamId,OPENID,tx);
    const ref=tx.collection('team_messages').doc(hash(`${OPENID}:${event.teamId}:${event.id}`));
    if((await ref.get()).data)return {sent:true};
    const window=Math.floor(Date.now()/60000);const limitRef=tx.collection('client_rate_limits').doc(hash(`chat:${OPENID}:${window}`));
    const rate=(await limitRef.get()).data;if((rate?.count||0)>=30)return {errMsg:'发送过于频繁，请稍后重试'};
    await limitRef.set({data:{count:(rate?.count||0)+1,expiresAt:Date.now()+120000}});
    await ref.set({data:{owner:OPENID,teamId:event.teamId,body:event.body.trim(),nickname:String(event.nickname||'徒步用户').slice(0,40),createdAt:Date.now()}});
    return {sent:true};
   });
  }
  if(action==='notifications.list'){
   const rows=(await db.collection('user_notifications').where({owner:OPENID}).orderBy('createdAt','desc').skip(page*20).limit(20).get()).data;return {items:rows,hasMore:rows.length===20};
  }
  if(action==='notifications.read'){
   if(!text(event.id,128))return {errMsg:'通知无效'};
   const rows=await db.collection('user_notifications').where({_id:event.id,owner:OPENID}).update({data:{read:true}});return {updated:rows.stats.updated>0};
  }
  if(action==='moderation.list'){
   if(!admins().has(OPENID))return {errMsg:'需要管理员权限'};
   const rows=(await db.collection('user_documents').where({status:'pending',visibility:'public'}).orderBy('updatedAt','asc').skip(page*20).limit(20).get()).data;return {items:rows,hasMore:rows.length===20};
  }
  if(action==='moderation.decide'){
   if(!admins().has(OPENID)||!text(event.id,128)||!['approve','reject'].includes(event.decision))return {errMsg:'无效审核操作'};
   return db.runTransaction(async tx=>{
    const ref=tx.collection('user_documents').doc(event.id);const row=(await ref.get()).data;
    if(!row||row.status!=='pending'||row.visibility!=='public'||event.version!==row.version)return {errMsg:'内容已变化，请刷新后审核'};
    const status=event.decision==='approve'?'approved':'rejected';
    await ref.update({data:{status,version:row.version+1,reviewedBy:OPENID,reviewedAt:Date.now()}});
    await tx.collection('user_notifications').doc(hash(`review:${event.id}:${row.version}`)).set({data:{owner:row.owner,title:status==='approved'?'内容审核通过':'内容未通过审核',documentId:event.id,read:false,createdAt:Date.now()}});
    return {reviewed:true};
   });
  }
  return {errMsg:'操作无效'};
 }catch(error){return {errMsg:error.message||'操作失败'};}
};
