import {callCloud} from './cloud';
import {ROUTES,onRouteCatalogChange} from './route-catalog';
import type {RouteStatus} from '@shared/types/route';
type Review={routeId:string;status:RouteStatus;sourceUrl:string;summary:string;riskNotice:string;checkedAt:string;expiresAt:number;version:number};
const KEY='he_route_reviews_v1';
const originals=new Map(ROUTES.map(r=>[r.id,{status:r.status,summary:r.summary,archive:r.archive}]));
let reviews:Review[]=[];let running=false,last=0;
function valid(r:any):r is Review{return !!r&&typeof r.routeId==='string'&&['开放中','即将开放','临时关闭','永久关闭','待核验'].includes(r.status)&&typeof r.sourceUrl==='string'&&/^https:\/\//.test(r.sourceUrl)&&typeof r.summary==='string'&&typeof r.riskNotice==='string'&&Number.isFinite(Date.parse(r.checkedAt))&&Number.isFinite(r.expiresAt)&&Number.isInteger(r.version);}
function applyReviews(){
 for(const review of reviews){const route=ROUTES.find(r=>r.id===review.routeId);if(!route)continue;
  if(!originals.has(route.id))originals.set(route.id,{status:route.status,summary:route.summary,archive:route.archive});
  if(originals.get(route.id)?.status==='永久关闭')continue;
  route.status=review.status==='开放中'&&review.expiresAt<=Date.now()?'待核验':review.status;
  route.summary=review.summary;
  route.archive={source:{label:'官方资料人工核验',url:review.sourceUrl},checkedAt:review.checkedAt,highlights:route.archive.highlights,riskNotice:review.riskNotice};
  // Status never enables geometry navigation or changes a track license.
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
