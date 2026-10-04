import {callCloud} from './cloud';
import {ROUTES,onRouteCatalogChange} from './route-catalog';
import type {RouteStatus} from '@shared/types/route';
type Review={routeId:string;status:RouteStatus;sourceUrl:string;summary:string;riskNotice:string;checkedAt:string;expiresAt:number;version:number;track?:{sourceUrl:string;license:string;path:[number,number][]}|null};
const KEY='he_route_reviews_v1';
const originals=new Map(ROUTES.map(r=>[r.id,{status:r.status,summary:r.summary,archive:r.archive,path:r.path,trackMode:r.trackMode}]));
let reviews:Review[]=[];let running=false,last=0;
function valid(r:any):r is Review{return !!r&&typeof r.routeId==='string'&&['开放中','即将开放','临时关闭','永久关闭','待核验'].includes(r.status)&&typeof r.sourceUrl==='string'&&/^https:\/\//.test(r.sourceUrl)&&typeof r.summary==='string'&&typeof r.riskNotice==='string'&&Number.isFinite(Date.parse(r.checkedAt))&&Number.isFinite(r.expiresAt)&&Number.isInteger(r.version);}
function applyReviews(){
 for(const review of reviews){const route=ROUTES.find(r=>r.id===review.routeId);if(!route)continue;
  if(!originals.has(route.id))originals.set(route.id,{status:route.status,summary:route.summary,archive:route.archive,path:route.path,trackMode:route.trackMode});
  if(originals.get(route.id)?.status==='永久关闭')continue;
  route.status=review.status==='开放中'&&review.expiresAt<=Date.now()?'待核验':review.status;
  route.openingExpiresAt=review.expiresAt;
  route.summary=review.summary;
  route.archive={source:{label:'官方资料人工核验',url:review.sourceUrl},checkedAt:review.checkedAt,highlights:route.archive.highlights,riskNotice:review.riskNotice};
  const base=originals.get(route.id)!;route.path=base.path;route.trackMode=base.trackMode;
  const track=review.track;
  if(track&&/^https:\/\//.test(track.sourceUrl)&&typeof track.license==='string'&&track.license.trim()&&Array.isArray(track.path)&&track.path.length>=2&&track.path.length<=20000&&track.path.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)){
   route.path=track.path;route.trackMode='已核验轨迹';
   route.archive.riskNotice+=`\n轨迹许可：${track.license}；来源：${track.sourceUrl}`;
  }
  // Opening and the separately reviewed licensed continuous geometry are both required.
 }
}
try {const raw=uni.getStorageSync(KEY);if(Array.isArray(raw))reviews=raw.filter(valid);}catch{}
onRouteCatalogChange(applyReviews);applyReviews();
export async function refreshRouteReviews():Promise<void>{
 applyReviews();if(running||Date.now()-last<15*60*1000)return;running=true;
 try{const fetched:Review[]=[];for(let page=0;page<100;page++){
  const result=await callCloud<{items:Review[];hasMore:boolean}>('route-manage',{action:'list',page});
  if(!result.ok||!result.data||!Array.isArray(result.data.items))return;
  fetched.push(...result.data.items.filter(valid));if(!result.data.hasMore)break;
  // Retain the complete previous snapshot if the bounded response is incomplete.
  if(page===99)return;
 }reviews=fetched;last=Date.now();applyReviews();try{uni.setStorageSync(KEY,reviews);}catch{}
 }finally{running=false;}
}
