import {callCloud} from './cloud';
import {ROUTES,onRouteCatalogChange} from './route-catalog';
import type {RouteStatus} from '@shared/types/route';
type Review={routeId:string;status:RouteStatus;sourceUrl:string;summary:string;riskNotice:string;checkedAt:string;expiresAt:number;version:number;track?:{sourceUrl:string;license:string;path:[number,number][]}|null};
const KEY='he_route_reviews_v1';
const seedIds=new Set(ROUTES.map(route=>route.id));
const originals=new Map(ROUTES.map(r=>[r.id,{status:r.status,summary:r.summary,archive:r.archive,path:r.path,trackMode:r.trackMode,openingExpiresAt:r.openingExpiresAt}]));
let reviews:Review[]=[];let running=false,last=0;
function valid(r:any):r is Review{return !!r&&typeof r.routeId==='string'&&['开放中','即将开放','临时关闭','永久关闭','待核验'].includes(r.status)&&typeof r.sourceUrl==='string'&&/^https:\/\//.test(r.sourceUrl)&&typeof r.summary==='string'&&typeof r.riskNotice==='string'&&Number.isFinite(Date.parse(r.checkedAt))&&Date.parse(r.checkedAt)<=Date.now()&&Number.isFinite(r.expiresAt)&&r.expiresAt>=Date.parse(r.checkedAt)&&r.expiresAt<=Date.parse(r.checkedAt)+7*86400000&&Number.isInteger(r.version);}
function applyReviews(){
 // Restore the last source baseline first. A removed review must not leave an
 // earlier open status or licensed track attached to the route.
 for(const route of ROUTES){const base=originals.get(route.id);if(base)Object.assign(route,base);}
 for(const route of ROUTES){if(route.status==='开放中'&&route.openingExpiresAt===undefined){route.status='待核验';route.openingExpiresAt=0;}}
 const byId=new Map(ROUTES.map(route=>[route.id,route]));
 for(const review of reviews){const route=byId.get(review.routeId);if(!route)continue;
  if(!originals.has(route.id))originals.set(route.id,{status:route.status,summary:route.summary,archive:route.archive,path:route.path,trackMode:route.trackMode,openingExpiresAt:route.openingExpiresAt});
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
onRouteCatalogChange(()=>{
 // A catalog refresh creates fresh route objects; update the source baseline
 // before reapplying the current complete review list.
 const wanted=new Set([...seedIds,...reviews.map(review=>review.routeId)]);
 originals.clear();for(const route of ROUTES)if(wanted.has(route.id))originals.set(route.id,{status:route.status,summary:route.summary,archive:route.archive,path:route.path,trackMode:route.trackMode,openingExpiresAt:route.openingExpiresAt});
 applyReviews();
});applyReviews();
export async function refreshRouteReviews():Promise<void>{
 applyReviews();if(running||Date.now()-last<15*60*1000)return;running=true;
 try{const fetched:Review[]=[];for(let page=0;page<100;page++){
  const result=await callCloud<{items:Review[];hasMore:boolean}>('route-manage',{action:'list',page});
  if(!result.ok||!result.data||!Array.isArray(result.data.items)||result.data.items.length>10||typeof result.data.hasMore!=='boolean'||!result.data.items.every(valid))return;
  fetched.push(...result.data.items);if(!result.data.hasMore)break;
  // Retain the complete previous snapshot if the bounded response is incomplete.
  if(page===99)return;
 }reviews=fetched;last=Date.now();applyReviews();try{uni.setStorageSync(KEY,reviews);}catch{}
 }finally{running=false;}
}
