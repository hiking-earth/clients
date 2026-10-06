import { reactive } from 'vue';
import {publicSnapshot} from './public-data';
import {readCatalogCache,writeCatalogCache,type CatalogSource} from './catalog-cache';
import { ROUTES as bundled, catalogRoutes } from '@shared/data/routes.catalog';
import { ROUTES as seed } from '@shared/data/routes.seed';
// Large regional catalogs are downloaded in verified pages instead of being
// embedded into every H5, native app, or mini-program package.
let latestUsfs:any={routes:[],attribution:'USDA Forest Service'};
let latestHk:any={routes:[],attribution:'DATA.GOV.HK-terms-1.2'};
const extras=new Map<string,typeof seed[number]>();
let curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk)];
try{const value=uni.getStorageSync('he_selected_catalog_routes_v1');if(Array.isArray(value)&&value.length<=200)for(const route of value){if(route&&typeof route.id==='string'&&['name','region','summary','distance','ascent','duration','difficulty','bestSeason','image','imageCredit'].every(key=>typeof route[key]==='string')&&Array.isArray(route.center)&&route.center.length===2&&route.center.every(Number.isFinite)&&Math.abs(route.center[0])<=180&&Math.abs(route.center[1])<=90&&route.archive&&typeof route.archive.source?.label==='string'&&typeof route.archive.checkedAt==='string'&&typeof route.archive.riskNotice==='string'&&Array.isArray(route.archive.highlights)&&route.archive.highlights.every((value:any)=>typeof value==='string')&&Array.isArray(route.path)&&Array.isArray(route.scenery)&&route.scenery.every((value:any)=>typeof value==='string')&&Array.isArray(route.bestSeasons))extras.set(route.id,{...route,status:'待核验',openingExpiresAt:0,trackMode:'不展示轨迹',path:[]});}}catch{}
let latestOsm: any = {routes:[],attribution:'© OpenStreetMap contributors · ODbL-1.0'};
export const catalogCacheState=reactive<Record<CatalogSource,{saved:boolean;message:string}>>({osm:{saved:false,message:'未同步'},usfs:{saved:false,message:'未同步'},hk:{saved:false,message:'未同步'}});
async function persist(source:CatalogSource,data:any){
 try{await writeCatalogCache(source,data);catalogCacheState[source]={saved:true,message:`已保存${data.routes.length}条${data.complete===false?`，来源共${data.sourceTotal}条，其余可在线检索`:''}，可离线查看`};}
 catch{catalogCacheState[source]={saved:false,message:'本次资料仅在内存中，离线保存失败，请检查设备空间'};}
}
export const ROUTES=reactive([...bundled]);
let inflight=false;
let nextOsmAttempt=0;let osmFailures=0;
const listeners=new Set<()=>void>();
export function onRouteCatalogChange(callback:()=>void):()=>void {listeners.add(callback);return ()=>listeners.delete(callback);}
function valid(data: any): boolean {
  return data?.schemaVersion===1 && data.license==='ODbL-1.0' && typeof data.generatedAt==='string' && Number.isFinite(Date.parse(data.generatedAt)) && Array.isArray(data.routes) && data.routes.length<=40000 && data.routes.every((r:any)=>
    r&&typeof r.id==='string' && /^osm-relation-\d+$/.test(r.id) && typeof r.name==='string' && r.name.length<=500 && typeof r.region==='string' && Array.isArray(r.center) && r.center.length===2 && r.center.every(Number.isFinite) && Math.abs(r.center[0])<=180 && Math.abs(r.center[1])<=90 && /^https:\/\/www\.openstreetmap\.org\/relation\/\d+$/.test(r.sourceUrl) && typeof r.fetchedAt==='string' && r.sourceTags && typeof r.sourceTags==='object');
}
function apply(data:any) {
  latestOsm=data;
  const names=new Set(curated.map(r=>r.name.normalize('NFKC').toLowerCase().replace(/[\s·—_-]/g,'')+':'+r.center.map((v:number)=>v.toFixed(1)).join(',')));
  const ids=new Set(curated.map(r=>r.id));
  const fresh=catalogRoutes(data).filter(r=>{const key=r.name.normalize('NFKC').toLowerCase().replace(/[\s·—_-]/g,'')+':'+r.center.map((v:number)=>v.toFixed(1)).join(',');if(names.has(key)||ids.has(r.id))return false;names.add(key);ids.add(r.id);return true;});
  ROUTES.splice(0,ROUTES.length);
  const next=[...curated,...fresh];const present=new Set(next.map(route=>route.id));for(const route of extras.values())if(!present.has(route.id))next.push(route);for(let start=0;start<next.length;start+=1000)ROUTES.push(...next.slice(start,start+1000).map(route=>({...route,archive:{...route.archive,source:{...route.archive.source}}})));
  listeners.forEach(callback=>callback());
}

export function refreshRouteCatalog(force=false): void {
  void restoreCatalogs().then(()=>refreshAll(force));
}
function refreshAll(force=false):void {
  refreshUsfsCatalog(force);refreshHkCatalog(force);
  if(inflight || (!force && Date.now()<nextOsmAttempt))return;
  inflight=true;
  void publicSnapshot('osm').then(async data=>{if(!valid(data))throw new Error('OSM目录格式无效');apply(data);await persist('osm',data);osmFailures=0;nextOsmAttempt=Date.now()+6*60*60*1000;}).catch(()=>{osmFailures++;nextOsmAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(osmFailures-1,5));}).finally(()=>{inflight=false;});
}

let nextUsfsAttempt=0,usfsFailures=0;
let usfsLoading=false;
export function refreshUsfsCatalog(force=false): void {
  if(usfsLoading||(!force&&Date.now()<nextUsfsAttempt))return;
  usfsLoading=true;
  void publicSnapshot('usfs').then(async data=>{
    if(!validUsfs(data))throw new Error('USFS目录格式无效');
    await persist('usfs',data);
    latestUsfs=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk)];apply(latestOsm);usfsFailures=0;nextUsfsAttempt=Date.now()+6*60*60*1000;
  }).catch(()=>{usfsFailures++;nextUsfsAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(usfsFailures-1,5));}).finally(()=>{usfsLoading=false;});
}

function validUsfs(data:any): boolean {
    if(data?.schemaVersion!==1 || data.attribution!=='USDA Forest Service' || typeof data.generatedAt!=='string' || !Number.isFinite(Date.parse(data.generatedAt)) || !Array.isArray(data.routes) || data.routes.length>40000)return false;
    const tagKeys=new Set(['trailNumber','hikingManaged','hikingAccepted','hikingRestricted']);
    if(!data.routes.every((r:any)=>r&&typeof r.id==='string' && /^usfs-[\w.-]+$/.test(r.id) && typeof r.name==='string' && r.name.length<=500 && typeof r.region==='string' && Array.isArray(r.center) && r.center.length===2 && r.center.every(Number.isFinite) && Math.abs(r.center[0])<=180 && Math.abs(r.center[1])<=90 && r.sourceUrl==='https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0' && typeof r.fetchedAt==='string' && Number.isFinite(Date.parse(r.fetchedAt)) && r.sourceTags && typeof r.sourceTags==='object' && !Array.isArray(r.sourceTags) && Object.entries(r.sourceTags).every(([key,value]:[string,any])=>tagKeys.has(key)&&(value===null||(typeof value==='string'&&value.length<=255)))))return false;
    return true;
}


function validHk(data:any):boolean {return data?.schemaVersion===1&&data.license==='DATA.GOV.HK-terms-1.2'&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length<=2000&&data.routes.every((r:any)=>r&&typeof r.id==='string'&&/^hk-afcd-\d+$/.test(r.id)&&typeof r.name==='string'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every(Number.isFinite)&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl==='https://portal.csdi.gov.hk/server/rest/services/common/afcd_rcd_1665568199103_4360/FeatureServer/0'&&r.sourceTags&&Array.isArray(r.referencePaths)&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90)));}
function applyHk(data:any){latestHk=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk)];apply(latestOsm);}

let nextHkAttempt=0,hkFailures=0;
let hkLoading=false;
export function refreshHkCatalog(force=false):void {
 if(hkLoading||(!force&&Date.now()<nextHkAttempt))return;
 hkLoading=true;
 void publicSnapshot('hk').then(async data=>{if(!validHk(data))throw new Error('香港步道目录格式无效');applyHk(data);await persist('hk',data);hkFailures=0;nextHkAttempt=Date.now()+6*60*60*1000;}).catch(()=>{hkFailures++;nextHkAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(hkFailures-1,5));}).finally(()=>{hkLoading=false;});
}

// Restore before the first remote refresh so late disk reads cannot overwrite
// a newer successful online snapshot. All three sources restore independently.
let catalogCacheReady:Promise<unknown>|undefined;
function restoreCatalogs():Promise<unknown>{
 return catalogCacheReady??=Promise.all(([['osm',valid],['usfs',validUsfs],['hk',validHk]] as const).map(async([source,validator])=>{
 const data=await readCatalogCache(source,validator);if(!data)return;
 if(source==='osm')apply(data);
 else if(source==='hk')applyHk(data);
 else{latestUsfs=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk)];apply(latestOsm);}
 catalogCacheState[source]={saved:true,message:'已恢复上次保存目录'};
})).then(()=>{apply(latestOsm);});
}

export function validCatalogSource(source:CatalogSource,data:any):boolean{return source==='osm'?valid(data):source==='usfs'?validUsfs(data):validHk(data);}
export function rememberDiscoveredRoute(route:typeof seed[number]):void{
 if(ROUTES.some(existing=>existing.id===route.id))return;
 extras.delete(route.id);extras.set(route.id,{...route,status:'待核验',openingExpiresAt:0});
 while(extras.size>200)extras.delete(extras.keys().next().value!);
 try{uni.setStorageSync('he_selected_catalog_routes_v1',[...extras.values()]);}catch{}
 apply(latestOsm);
}
