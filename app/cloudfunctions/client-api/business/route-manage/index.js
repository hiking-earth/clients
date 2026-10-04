const cloud=require('wx-server-sdk');const crypto=require('crypto');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});const db=cloud.database({throwOnNotFound:false});
const statuses=['开放中','即将开放','临时关闭','永久关闭','待核验'];
exports.main=async event=>{
 const OPENID = require('../../identity').optionalIdentity();
 if(event.action==='list'){
  const page=Number.isInteger(event.page)&&event.page>=0&&event.page<1000?event.page:0;
  const rows=(await db.collection('route_reviews').orderBy('updatedAt','desc').skip(page*100).limit(100).get()).data;
  return {items:rows.map(({reviewedBy,...row})=>row),hasMore:rows.length===100};
 }
 const admins=new Set(String(process.env.HIKING_ADMIN_IDENTITIES||'').split(',').map(x=>x.trim()).filter(Boolean));
 if(!OPENID||!admins.has(OPENID))return {errMsg:'需要管理员权限'};
 if(event.action!=='save'||typeof event.routeId!=='string'||event.routeId.length>128||!statuses.includes(event.status))return {errMsg:'路线审核格式无效'};
 let source;try{source=new URL(event.sourceUrl);}catch{return {errMsg:'需提供官方资料链接'};}
 const allowed=String(process.env.HIKING_OFFICIAL_DOMAINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(source.protocol!=='https:'||source.username||source.password||!allowed.some(domain=>source.hostname===domain||source.hostname.endsWith('.'+domain)))return {errMsg:'该来源域名尚未配置为官方资料源'};
 if(typeof event.summary!=='string'||event.summary.length>3000||typeof event.riskNotice!=='string'||event.riskNotice.length>3000)return {errMsg:'资料内容格式无效'};
 const checkedAt=Date.parse(event.checkedAt);if(!Number.isFinite(checkedAt)||checkedAt>Date.now()||checkedAt<Date.now()-30*86400000)return {errMsg:'开放资料须为最近30天核验记录'};
 const expiresAt=Math.min(checkedAt+7*86400000,Date.now()+7*86400000);
 if(event.status==='开放中'&&expiresAt<=Date.now())return {errMsg:'开放状态资料已过期，请重新核验'};
 const id=crypto.createHash('sha256').update(event.routeId).digest('hex');
 return db.runTransaction(async tx=>{const ref=tx.collection('route_reviews').doc(id);const prior=(await ref.get()).data;
  if(event.version!==(prior?.version||0))return {errMsg:'另一管理员已修改，请刷新后重试'};
  await ref.set({data:{routeId:event.routeId,status:event.status,sourceUrl:source.href,summary:event.summary,riskNotice:event.riskNotice,checkedAt:new Date(checkedAt).toISOString(),expiresAt,updatedAt:Date.now(),reviewedBy:OPENID,version:(prior?.version||0)+1}});return {saved:true,version:(prior?.version||0)+1};});
};
