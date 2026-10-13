import { reactive } from 'vue';
import {publicSnapshot} from './public-data';
import {readCatalogCache,writeCatalogCache,type CatalogSource} from './catalog-cache';
import { ROUTES as bundled, catalogRoutes } from '@shared/data/routes.catalog';
import { ROUTES as seed } from '@shared/data/routes.seed';
// Large regional catalogs are downloaded in verified pages instead of being
// embedded into every H5, native app, or mini-program package.
let latestUsfs:any={routes:[],attribution:'USDA Forest Service'};
let latestHk:any={routes:[],attribution:'DATA.GOV.HK-terms-1.2'};
let latestNzdoc:any={routes:[],attribution:'Crown Copyright: Department of Conservation Te Papa Atawhai'};
let latestParksCanada:any={routes:[],attribution:'Contains information licensed under the Open Government Licence – Canada. Source: Parks Canada (Trails APCA).'};
let latestNswNpws:any={routes:[],attribution:'© State Government of NSW and NSW Department of Climate Change, Energy, the Environment and Water 2017.'};
let latestEngland:any={routes:[],attribution:'© Natural England copyright. Contains Ordnance Survey data.'};
let latestWales:any={routes:[],attribution:'Contains Natural Resources Wales information © Natural Resources Wales and Database Right.'};
let latestScotlandArgyll:any={routes:[],attribution:'Contains spatial data licensed under Open Government Licence v3.0 from Argyll and Bute Council. Source: Adopted Core Paths.'};
let latestNiMidulster:any={routes:[],attribution:'Contains information licensed under the Open Government Licence v3.0 from OpenDataNI and Mid Ulster District Council. Source: Public Rights of Way.'};
let latestNorfolk:any={routes:[],attribution:'Contains Norfolk County Council Public Rights of Way data. © Norfolk County Council and © Crown copyright and database rights 2019 Ordnance Survey 100019340.'};
let latestCambridgeshire:any={routes:[],attribution:'Contains information licensed under the Open Government Licence v3.0 from Cambridgeshire County Council. Source: Public Rights of Way.'};
let latestVictoria:any={routes:[],attribution:'Contains Victorian Government data from Recreation Tracks, Department of Energy, Environment and Climate Action. Licensed under CC BY 4.0.'};
const extras=new Map<string,typeof seed[number]>();
let curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];
try{const value=uni.getStorageSync('he_selected_catalog_routes_v1');if(Array.isArray(value)&&value.length<=200)for(const route of value){if(route&&typeof route.id==='string'&&['name','region','summary','distance','ascent','duration','difficulty','bestSeason','image','imageCredit'].every(key=>typeof route[key]==='string')&&Array.isArray(route.center)&&route.center.length===2&&route.center.every(Number.isFinite)&&Math.abs(route.center[0])<=180&&Math.abs(route.center[1])<=90&&route.archive&&typeof route.archive.source?.label==='string'&&typeof route.archive.checkedAt==='string'&&typeof route.archive.riskNotice==='string'&&Array.isArray(route.archive.highlights)&&route.archive.highlights.every((value:any)=>typeof value==='string')&&Array.isArray(route.path)&&Array.isArray(route.scenery)&&route.scenery.every((value:any)=>typeof value==='string')&&Array.isArray(route.bestSeasons))extras.set(route.id,{...route,status:'待核验',openingExpiresAt:0,trackMode:'不展示轨迹',path:[]});}}catch{}
let latestOsm: any = {routes:[],attribution:'© OpenStreetMap contributors · ODbL-1.0'};
export const catalogCacheState=reactive<Record<CatalogSource,{saved:boolean;message:string}>>({osm:{saved:false,message:'未同步'},usfs:{saved:false,message:'未同步'},hk:{saved:false,message:'未同步'},nzdoc:{saved:false,message:'未同步'},parkscanada:{saved:false,message:'未同步'},'nsw-npws':{saved:false,message:'未同步'},england:{saved:false,message:'未同步'},wales:{saved:false,message:'未同步'},'scotland-argyll':{saved:false,message:'未同步'},'ni-midulster':{saved:false,message:'未同步'},'norfolk-prow':{saved:false,message:'未同步'},'cambridgeshire-prow':{saved:false,message:'未同步'},'nps-public-trails':{saved:false,message:'未同步'},'victoria-recreation-tracks':{saved:false,message:'未同步'}});
async function persist(source:CatalogSource,data:any){
 try{await writeCatalogCache(source,data);catalogCacheState[source]={saved:true,message:`已保存${data.routes.length}条${data.complete===false?`，来源共${data.sourceTotal}条，其余可在线检索`:''}，可离线查看`};}
 catch{catalogCacheState[source]={saved:false,message:'本次资料仅在内存中，离线保存失败，请检查设备空间'};}
}
function failedRefresh(source:CatalogSource){
 const saved=catalogCacheState[source].saved;
 catalogCacheState[source]={saved,message:saved?'目录更新失败，保留本机资料；稍后自动重试':'目录更新失败，暂无本机缓存；稍后自动重试'};
}
export const ROUTES=reactive([...bundled]);
export const catalogRefreshState=reactive<Record<CatalogSource,boolean>>({osm:false,usfs:false,hk:false,nzdoc:false,parkscanada:false,'nsw-npws':false,england:false,wales:false,'scotland-argyll':false,'ni-midulster':false,'norfolk-prow':false,'cambridgeshire-prow':false,'nps-public-trails':false,'victoria-recreation-tracks':false});
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
  refreshUsfsCatalog(force);refreshHkCatalog(force);refreshNzdocCatalog(force);refreshParksCanadaCatalog(force);refreshNswNpwsCatalog(force);refreshEnglandCatalog(force);refreshWalesCatalog(force);refreshScotlandArgyllCatalog(force);refreshNiMidulsterCatalog(force);refreshNorfolkCatalog(force);refreshCambridgeshireCatalog(force);refreshVictoriaCatalog(force);
  if(inflight || (!force && Date.now()<nextOsmAttempt))return;
  inflight=true;catalogRefreshState.osm=true;
  void publicSnapshot('osm').then(async data=>{if(!valid(data))throw new Error('OSM目录格式无效');apply(data);await persist('osm',data);osmFailures=0;nextOsmAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('osm');osmFailures++;nextOsmAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(osmFailures-1,5));}).finally(()=>{inflight=false;catalogRefreshState.osm=false;});
}

let nextUsfsAttempt=0,usfsFailures=0;
let usfsLoading=false;
export function refreshUsfsCatalog(force=false): void {
  if(usfsLoading||(!force&&Date.now()<nextUsfsAttempt))return;
  usfsLoading=true;catalogRefreshState.usfs=true;
  void publicSnapshot('usfs').then(async data=>{
    if(!validUsfs(data))throw new Error('USFS目录格式无效');
    await persist('usfs',data);
    latestUsfs=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);usfsFailures=0;nextUsfsAttempt=Date.now()+6*60*60*1000;
  }).catch(()=>{failedRefresh('usfs');usfsFailures++;nextUsfsAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(usfsFailures-1,5));}).finally(()=>{usfsLoading=false;catalogRefreshState.usfs=false;});
}

function validUsfs(data:any): boolean {
    if(data?.schemaVersion!==1 || data.attribution!=='USDA Forest Service' || typeof data.generatedAt!=='string' || !Number.isFinite(Date.parse(data.generatedAt)) || !Array.isArray(data.routes) || data.routes.length>40000)return false;
    const tagKeys=new Set(['trailNumber','hikingManaged','hikingAccepted','hikingRestricted']);
    if(!data.routes.every((r:any)=>r&&typeof r.id==='string' && /^usfs-[\w.-]+$/.test(r.id) && typeof r.name==='string' && r.name.length<=500 && typeof r.region==='string' && Array.isArray(r.center) && r.center.length===2 && r.center.every(Number.isFinite) && Math.abs(r.center[0])<=180 && Math.abs(r.center[1])<=90 && r.sourceUrl==='https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0' && typeof r.fetchedAt==='string' && Number.isFinite(Date.parse(r.fetchedAt)) && r.sourceTags && typeof r.sourceTags==='object' && !Array.isArray(r.sourceTags) && Object.entries(r.sourceTags).every(([key,value]:[string,any])=>tagKeys.has(key)&&(value===null||(typeof value==='string'&&value.length<=255)))))return false;
    return true;
}


function validHk(data:any):boolean {return data?.schemaVersion===1&&data.license==='DATA.GOV.HK-terms-1.2'&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length<=2000&&data.routes.every((r:any)=>r&&typeof r.id==='string'&&/^hk-afcd-\d+$/.test(r.id)&&typeof r.name==='string'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every(Number.isFinite)&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl==='https://portal.csdi.gov.hk/server/rest/services/common/afcd_rcd_1665568199103_4360/FeatureServer/0'&&r.sourceTags&&Array.isArray(r.referencePaths)&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90)));}
function applyHk(data:any){latestHk=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}

let nextHkAttempt=0,hkFailures=0;
let hkLoading=false;
export function refreshHkCatalog(force=false):void {
 if(hkLoading||(!force&&Date.now()<nextHkAttempt))return;
 hkLoading=true;catalogRefreshState.hk=true;
 void publicSnapshot('hk').then(async data=>{if(!validHk(data))throw new Error('香港步道目录格式无效');applyHk(data);await persist('hk',data);hkFailures=0;nextHkAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('hk');hkFailures++;nextHkAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(hkFailures-1,5));}).finally(()=>{hkLoading=false;catalogRefreshState.hk=false;});
}

let nextNzdocAttempt=0,nzdocFailures=0;
let nzdocLoading=false;
const NZDOC_SOURCE_URL='https://services1.arcgis.com/3JjYDyG3oajxU6HO/ArcGIS/rest/services/DOC_Walking_Experiences/FeatureServer/1';
function validNzdoc(data:any):boolean {
 const validUrl=(value:any)=>typeof value==='string'&&value.length<=2048&&(()=>{try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='www.doc.govt.nz'&&!url.username&&!url.password&&!url.port;}catch{return false;}})();
 return data?.schemaVersion===1&&data.license==='CC-BY-3.0-NZ'&&/^Crown Copyright: Department of Conservation Te Papa Atawhai \d{4}$/.test(data.attribution)&&data.licenseUrl==='https://www.doc.govt.nz/our-work/maps-and-data/terms-and-conditions/'&&data.sourceUrl===NZDOC_SOURCE_URL&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length<=4000&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags;
  const tagKeys=['distanceKm','difficulty','estimatedTime','hasAlerts','officialUrl'];
  return r&&typeof r.id==='string'&&/^nzdoc-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=500&&r.region==='新西兰'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every(Number.isFinite)&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===NZDOC_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).every(key=>tagKeys.includes(key))&&(tags.distanceKm===null||typeof tags.distanceKm==='number'&&Number.isFinite(tags.distanceKm)&&tags.distanceKm>0)&&['difficulty','estimatedTime','hasAlerts'].every(key=>tags[key]===null||typeof tags[key]==='string'&&tags[key].length<=500)&&(tags.officialUrl===null||validUrl(tags.officialUrl))&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((value:any)=>typeof value==='number'&&Number.isFinite(value))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));
 });
}
function applyNzdoc(data:any){latestNzdoc=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
export function refreshNzdocCatalog(force=false):void {
 if(nzdocLoading||(!force&&Date.now()<nextNzdocAttempt))return;
 nzdocLoading=true;catalogRefreshState.nzdoc=true;
 void publicSnapshot('nzdoc').then(async data=>{if(!validNzdoc(data))throw new Error('新西兰官方目录格式无效');applyNzdoc(data);await persist('nzdoc',data);nzdocFailures=0;nextNzdocAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('nzdoc');nzdocFailures++;nextNzdocAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(nzdocFailures-1,5));}).finally(()=>{nzdocLoading=false;catalogRefreshState.nzdoc=false;});
}

let nextParksCanadaAttempt=0,parksCanadaFailures=0;
let parksCanadaLoading=false;
const PARKSCANADA_SOURCE_URL='https://services2.arcgis.com/wCOMu5IS7YdSyPNx/arcgis/rest/services/vw_Trails_Sentiers_APCA_V2_FGP/FeatureServer/0';
const PARKSCANADA_LICENSE='Open Government Licence - Canada';
const PARKSCANADA_ATTRIBUTION='Contains information licensed under the Open Government Licence – Canada. Source: Parks Canada (Trails APCA).';
const PARKSCANADA_LICENSE_URL='https://open.canada.ca/en/open-government-licence-canada/';
function validParksCanadaUrl(value:any):boolean{return typeof value==='string'&&value.length<=2048&&/^https:\/\/(?:www\.)?(?:pc\.gc\.ca|parks\.canada\.ca)(?:[/?#]|$)/i.test(value);}
function validParksCanada(data:any):boolean {
 return data?.schemaVersion===1&&data.license===PARKSCANADA_LICENSE&&data.attribution===PARKSCANADA_ATTRIBUTION&&data.licenseUrl===PARKSCANADA_LICENSE_URL&&data.sourceUrl===PARKSCANADA_SOURCE_URL&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length<=4000&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags;
  const tagKeys=['distanceKm','nameFrench','alternateName','trailSystem','officialUrlEn','officialUrlFr'];
  return r&&typeof r.id==='string'&&/^parkscanada-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=500&&r.region==='加拿大'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===PARKSCANADA_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).every(key=>tagKeys.includes(key))&&(tags.distanceKm===null||typeof tags.distanceKm==='number'&&Number.isFinite(tags.distanceKm)&&tags.distanceKm>0)&&['nameFrench','alternateName','trailSystem'].every(key=>tags[key]===null||typeof tags[key]==='string'&&tags[key].length<=500)&&['officialUrlEn','officialUrlFr'].every(key=>tags[key]===null||validParksCanadaUrl(tags[key]))&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));
 });
}
function applyParksCanada(data:any){latestParksCanada=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
export function refreshParksCanadaCatalog(force=false):void {
 if(parksCanadaLoading||(!force&&Date.now()<nextParksCanadaAttempt))return;
 parksCanadaLoading=true;catalogRefreshState.parkscanada=true;
 void publicSnapshot('parkscanada').then(async data=>{if(!validParksCanada(data))throw new Error('加拿大公园管理局目录格式无效');applyParksCanada(data);await persist('parkscanada',data);parksCanadaFailures=0;nextParksCanadaAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('parkscanada');parksCanadaFailures++;nextParksCanadaAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(parksCanadaFailures-1,5));}).finally(()=>{parksCanadaLoading=false;catalogRefreshState.parkscanada=false;});
}

let nextNswNpwsAttempt=0,nswNpwsFailures=0;
let nswNpwsLoading=false;
const NSW_NPWS_SOURCE_URL='https://services7.arcgis.com/9nlQUywsHzFwAwIM/arcgis/rest/services/NPWS_Tracks/FeatureServer/0';
const NSW_NPWS_ATTRIBUTION='© State Government of NSW and NSW Department of Climate Change, Energy, the Environment and Water 2017. Source: NSW NPWS Asset Infrastructure – Track Section.';
const NSW_NPWS_LICENSE_URL='https://data.nsw.gov.au/data/dataset/asset-infrastructure-track-section8bfcf';
function validNswNpws(data:any):boolean {
 return data?.schemaVersion===1&&data.license==='Creative Commons Attribution'&&data.attribution===NSW_NPWS_ATTRIBUTION&&data.licenseUrl===NSW_NPWS_LICENSE_URL&&data.sourceUrl===NSW_NPWS_SOURCE_URL&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length<=10000&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags,tagKeys=['distanceKm','assetClass','assetType','branch','sourceModifiedAt','sourceVersionDate'];
  return r&&typeof r.id==='string'&&/^nsw-npws-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=500&&r.region==='澳大利亚·新南威尔士州'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===NSW_NPWS_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).every(key=>tagKeys.includes(key))&&(tags.distanceKm===null||typeof tags.distanceKm==='number'&&Number.isFinite(tags.distanceKm)&&tags.distanceKm>0)&&['assetClass','branch','sourceVersionDate'].every(key=>tags[key]===null||typeof tags[key]==='string'&&tags[key].length<=300)&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));
 });
}
function applyNswNpws(data:any){latestNswNpws=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
export function refreshNswNpwsCatalog(force=false):void {
 if(nswNpwsLoading||(!force&&Date.now()<nextNswNpwsAttempt))return;
 nswNpwsLoading=true;catalogRefreshState['nsw-npws']=true;
 void publicSnapshot('nsw-npws').then(async data=>{if(!validNswNpws(data))throw new Error('新南威尔士州目录格式无效');applyNswNpws(data);await persist('nsw-npws',data);nswNpwsFailures=0;nextNswNpwsAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('nsw-npws');nswNpwsFailures++;nextNswNpwsAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(nswNpwsFailures-1,5));}).finally(()=>{nswNpwsLoading=false;catalogRefreshState['nsw-npws']=false;});
}

let nextEnglandAttempt=0,englandFailures=0,englandLoading=false;
const ENGLAND_SOURCE_URL='https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services/National_Trails_England/FeatureServer/0';
const ENGLAND_LICENSE_URL='https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
function validEngland(data:any):boolean {
 const year=new Date(data?.generatedAt).getUTCFullYear();
 const attribution=`© Natural England copyright. Contains Ordnance Survey data © Crown copyright and database right ${year}.`;
 return data?.schemaVersion===1&&data.license==='Open Government Licence v3.0'&&data.attribution===attribution&&data.licenseUrl===ENGLAND_LICENSE_URL&&data.sourceUrl===ENGLAND_SOURCE_URL&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length>0&&data.routes.length<=100&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags,tagKeys=['distanceKm','start','end','openedDate','sourceUpdatedAt'];
  return r&&typeof r.id==='string'&&/^england-trail-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=120&&r.region==='英国·英格兰'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===ENGLAND_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).every(key=>tagKeys.includes(key))&&(tags.distanceKm===null||typeof tags.distanceKm==='number'&&Number.isFinite(tags.distanceKm)&&tags.distanceKm>0)&&['start','end','openedDate','sourceUpdatedAt'].every(key=>tags[key]===null||typeof tags[key]==='string'&&tags[key].length<=120)&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));
 });
}
function applyEngland(data:any){latestEngland=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
export function refreshEnglandCatalog(force=false):void {
 if(englandLoading||(!force&&Date.now()<nextEnglandAttempt))return;
 englandLoading=true;catalogRefreshState.england=true;
 void publicSnapshot('england').then(async data=>{if(!validEngland(data))throw new Error('英格兰国家步道目录格式无效');applyEngland(data);await persist('england',data);englandFailures=0;nextEnglandAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('england');englandFailures++;nextEnglandAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(englandFailures-1,5));}).finally(()=>{englandLoading=false;catalogRefreshState.england=false;});
}


let nextWalesAttempt=0,walesFailures=0,walesLoading=false;
const WALES_SOURCE_URL='https://datamap.gov.wales/geoserver/ows?outputFormat=application%2Fjson&request=GetFeature&service=WFS&srsName=EPSG%3A4326&typename=inspire-nrw%3ANRW_NATIONAL_TRAIL&version=1.0.0';
const WALES_ATTRIBUTION='Contains Natural Resources Wales information © Natural Resources Wales and Database Right. All rights Reserved. Contains Ordnance Survey Data. Ordnance Survey Licence number AC0000849444. Crown Copyright and Database Right.';
const WALES_LICENSE_URL='https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
function validWales(data:any):boolean {
 return data?.schemaVersion===1&&data.license==='Open Government Licence for Public Sector Information (OGL)'&&data.attribution===WALES_ATTRIBUTION&&data.licenseUrl===WALES_LICENSE_URL&&data.sourceUrl===WALES_SOURCE_URL&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length>0&&data.routes.length<=100&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags;
  return r&&typeof r.id==='string'&&/^wales-trail-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=160&&r.region==='英国·威尔士'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===WALES_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).every(key=>key==='sourceStatus')&&(tags.sourceStatus===null||typeof tags.sourceStatus==='string'&&tags.sourceStatus.length<=200)&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));
 });
}
function applyWales(data:any){latestWales=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
export function refreshWalesCatalog(force=false):void {
 if(walesLoading||(!force&&Date.now()<nextWalesAttempt))return;
 walesLoading=true;catalogRefreshState.wales=true;
 void publicSnapshot('wales').then(async data=>{if(!validWales(data))throw new Error('威尔士国家步道目录格式无效');applyWales(data);await persist('wales',data);walesFailures=0;nextWalesAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('wales');walesFailures++;nextWalesAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(walesFailures-1,5));}).finally(()=>{walesLoading=false;catalogRefreshState.wales=false;});
}

let nextScotlandArgyllAttempt=0,scotlandArgyllFailures=0,scotlandArgyllLoading=false;
const SCOTLAND_ARGYLL_SOURCE_URL='https://arcgis.argyll-bute.gov.uk/arcgis/rest/services/Open_Data/MapServer/27';
const SCOTLAND_ARGYLL_ATTRIBUTION='Contains spatial data licensed under Open Government Licence v3.0 from Argyll and Bute Council. Source: Adopted Core Paths.';
const SCOTLAND_ARGYLL_LICENSE_URL='https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
const NORFOLK_SOURCE_URL='https://maps.norfolk.gov.uk/arcgis/rest/services/layers_ext/highways/MapServer/2';
const NORFOLK_ATTRIBUTION='Contains Norfolk County Council Public Rights of Way data. © Norfolk County Council and © Crown copyright and database rights 2019 Ordnance Survey 100019340. Licensed under Open Government Licence v3.0; source metadata also lists Creative Commons Attribution.';
const NORFOLK_LICENSE_URL='https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
function validNorfolk(data:any):boolean {
 return data?.schemaVersion===1&&data.license==='Open Government Licence v3.0; data.gov.uk lists Creative Commons Attribution'&&data.attribution===NORFOLK_ATTRIBUTION&&data.licenseUrl===NORFOLK_LICENSE_URL&&data.sourceUrl===NORFOLK_SOURCE_URL&&typeof data.routeStatusPolicy==='string'&&data.routeStatusPolicy.length<=1200&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length>0&&data.routes.length<=10000&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags,keys=['sourceId','pathClass','primaryRight','parish','linkCode','section','administrativeUnit'];
  return r&&typeof r.id==='string'&&/^norfolk-prow-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=500&&r.region==='英国·英格兰·诺福克'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===NORFOLK_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&r.status==='待核验'&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).length===keys.length&&Object.keys(tags).every((key:string)=>keys.includes(key))&&keys.every(key=>tags[key]===null||typeof tags[key]==='string'&&tags[key].length<=300)&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));
 });
}
function applyNorfolk(data:any){latestNorfolk=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
let nextNorfolkAttempt=0,norfolkFailures=0,norfolkLoading=false;
export function refreshNorfolkCatalog(force=false):void {
 if(norfolkLoading||(!force&&Date.now()<nextNorfolkAttempt))return;
 norfolkLoading=true;catalogRefreshState['norfolk-prow']=true;
 void publicSnapshot('norfolk-prow').then(async data=>{if(!validNorfolk(data))throw new Error('诺福克公共通行权目录格式无效');applyNorfolk(data);await persist('norfolk-prow',data);norfolkFailures=0;nextNorfolkAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('norfolk-prow');norfolkFailures++;nextNorfolkAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(norfolkFailures-1,5));}).finally(()=>{norfolkLoading=false;catalogRefreshState['norfolk-prow']=false;});
}
const CAMBRIDGESHIRE_SOURCE_URL='https://maps.cambridgeshire.gov.uk/GetOWS.ashx?SERVICE=WFS&VERSION=2.0.0&MAPSOURCE=CCC%2FINSPIRE&REQUEST=GetFeature&TYPENAME=public_rights_of_way&OUTPUTFORMAT=GEOJSON&SRSNAME=EPSG%3A4326';
const CAMBRIDGESHIRE_ATTRIBUTION='Contains information licensed under the Open Government Licence v3.0 from Cambridgeshire County Council. Source: Public Rights of Way.';
const CAMBRIDGESHIRE_LICENSE_URL='https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
function validCambridgeshire(data:any):boolean {
 return data?.schemaVersion===1&&data.license==='Open Government Licence v3.0'&&data.attribution===CAMBRIDGESHIRE_ATTRIBUTION&&data.licenseUrl===CAMBRIDGESHIRE_LICENSE_URL&&data.sourceUrl===CAMBRIDGESHIRE_SOURCE_URL&&typeof data.routeStatusPolicy==='string'&&data.routeStatusPolicy.length<=1200&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length>0&&data.routes.length<=5000&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags,keys=['sourceStatus','parish','pathNumber','parishNumber','district','lengthKm'];
  return r&&typeof r.id==='string'&&/^cambridgeshire-prow-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=500&&r.region==='英国·英格兰·剑桥郡'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&r.center[0]>=-1&&r.center[0]<=1&&r.center[1]>=51&&r.center[1]<=53.5&&r.sourceUrl===CAMBRIDGESHIRE_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&r.status==='待核验'&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).length===keys.length&&Object.keys(tags).every((key:string)=>keys.includes(key))&&keys.filter(key=>key!=='lengthKm').every(key=>tags[key]===null||typeof tags[key]==='string'&&tags[key].length<=300)&&(tags.lengthKm===null||typeof tags.lengthKm==='number'&&Number.isFinite(tags.lengthKm)&&tags.lengthKm>=0&&tags.lengthKm<=1000)&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&point[0]>=-1&&point[0]<=1&&point[1]>=51&&point[1]<=53.5));
 });
}
function applyCambridgeshire(data:any){latestCambridgeshire=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
let nextCambridgeshireAttempt=0,cambridgeshireFailures=0,cambridgeshireLoading=false;
export function refreshCambridgeshireCatalog(force=false):void {
 if(cambridgeshireLoading||(!force&&Date.now()<nextCambridgeshireAttempt))return;
 cambridgeshireLoading=true;catalogRefreshState['cambridgeshire-prow']=true;
 void publicSnapshot('cambridgeshire-prow').then(async data=>{if(!validCambridgeshire(data))throw new Error('剑桥郡公共通行权目录格式无效');applyCambridgeshire(data);await persist('cambridgeshire-prow',data);cambridgeshireFailures=0;nextCambridgeshireAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('cambridgeshire-prow');cambridgeshireFailures++;nextCambridgeshireAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(cambridgeshireFailures-1,5));}).finally(()=>{cambridgeshireLoading=false;catalogRefreshState['cambridgeshire-prow']=false;});
}
function applyVictoria(data:any){latestVictoria=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
let nextVictoriaAttempt=0,victoriaFailures=0,victoriaLoading=false;
export function refreshVictoriaCatalog(force=false):void{
 if(victoriaLoading||(!force&&Date.now()<nextVictoriaAttempt))return;
 victoriaLoading=true;catalogRefreshState['victoria-recreation-tracks']=true;
 void publicSnapshot('victoria-recreation-tracks').then(async data=>{if(!validVictoria(data))throw new Error('维多利亚州步道目录格式无效');applyVictoria(data);await persist('victoria-recreation-tracks',data);victoriaFailures=0;nextVictoriaAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('victoria-recreation-tracks');victoriaFailures++;nextVictoriaAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(victoriaFailures-1,5));}).finally(()=>{victoriaLoading=false;catalogRefreshState['victoria-recreation-tracks']=false;});
}
const NI_MIDULSTER_SOURCE_URL='https://services1.arcgis.com/IBPnlgK2X1Ngocds/arcgis/rest/services/PROW/FeatureServer/0';
const NI_MIDULSTER_ATTRIBUTION='Contains information licensed under the Open Government Licence v3.0 from OpenDataNI and Mid Ulster District Council. Source: Public Rights of Way.';
const NI_MIDULSTER_LICENSE_URL='https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';
function validNiMidulster(data:any):boolean {
 return data?.schemaVersion===1&&data.license==='Open Government Licence v3.0'&&data.attribution===NI_MIDULSTER_ATTRIBUTION&&data.licenseUrl===NI_MIDULSTER_LICENSE_URL&&data.sourceUrl===NI_MIDULSTER_SOURCE_URL&&typeof data.routeStatusPolicy==='string'&&data.routeStatusPolicy.length<=1200&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length<=5000&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags,tagKeys=['sourceStatus','condition','council','authorityDate','asserted','lengthM'];
  return r&&typeof r.id==='string'&&/^ni-midulster-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=300&&r.region==='英国·北爱尔兰·米德阿尔斯特'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===NI_MIDULSTER_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&r.status==='待核验'&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).every(key=>tagKeys.includes(key))&&['sourceStatus','condition','council','authorityDate','asserted'].every(key=>tags[key]===null||typeof tags[key]==='string'&&tags[key].length<=300)&&(tags.lengthM===null||typeof tags.lengthM==='number'&&Number.isFinite(tags.lengthM)&&tags.lengthM>=0)&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));
 });
}
function applyNiMidulster(data:any){latestNiMidulster=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
let nextNiMidulsterAttempt=0,niMidulsterFailures=0,niMidulsterLoading=false;
export function refreshNiMidulsterCatalog(force=false):void {
 if(niMidulsterLoading||(!force&&Date.now()<nextNiMidulsterAttempt))return;
 niMidulsterLoading=true;catalogRefreshState['ni-midulster']=true;
 void publicSnapshot('ni-midulster').then(async data=>{if(!validNiMidulster(data))throw new Error('北爱尔兰米德阿尔斯特目录格式无效');applyNiMidulster(data);await persist('ni-midulster',data);niMidulsterFailures=0;nextNiMidulsterAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('ni-midulster');niMidulsterFailures++;nextNiMidulsterAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(niMidulsterFailures-1,5));}).finally(()=>{niMidulsterLoading=false;catalogRefreshState['ni-midulster']=false;});
}

function validScotlandArgyll(data:any):boolean {
 return data?.schemaVersion===1&&data.license==='Open Government Licence v3.0'&&data.attribution===SCOTLAND_ARGYLL_ATTRIBUTION&&data.licenseUrl===SCOTLAND_ARGYLL_LICENSE_URL&&data.sourceUrl===SCOTLAND_ARGYLL_SOURCE_URL&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length>0&&data.routes.length<=5000&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags,tagKeys=['pathNumber','grade','leaflet','distanceKm','walkLength','localInfo','additionalInfo','pathInfo','publicNote','publicRoad'];
  return r&&typeof r.id==='string'&&/^scotland-argyll-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=500&&r.region==='英国·苏格兰·阿盖尔-比特'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===SCOTLAND_ARGYLL_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).every(key=>tagKeys.includes(key))&&(tags.distanceKm===null||typeof tags.distanceKm==='number'&&Number.isFinite(tags.distanceKm)&&tags.distanceKm>0)&&tagKeys.filter(key=>key!=='distanceKm').every(key=>tags[key]===null||typeof tags[key]==='string'&&tags[key].length<=500)&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));
 });
}
function applyScotlandArgyll(data:any){latestScotlandArgyll=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
export function refreshScotlandArgyllCatalog(force=false):void {
 if(scotlandArgyllLoading||(!force&&Date.now()<nextScotlandArgyllAttempt))return;
 scotlandArgyllLoading=true;catalogRefreshState['scotland-argyll']=true;
 void publicSnapshot('scotland-argyll').then(async data=>{if(!validScotlandArgyll(data))throw new Error('苏格兰阿盖尔-比特核心步道目录格式无效');applyScotlandArgyll(data);await persist('scotland-argyll',data);scotlandArgyllFailures=0;nextScotlandArgyllAttempt=Date.now()+6*60*60*1000;}).catch(()=>{failedRefresh('scotland-argyll');scotlandArgyllFailures++;nextScotlandArgyllAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(scotlandArgyllFailures-1,5));}).finally(()=>{scotlandArgyllLoading=false;catalogRefreshState['scotland-argyll']=false;});
}

// Restore before the first remote refresh so late disk reads cannot overwrite
// a newer successful online snapshot. Sources restore independently.
let catalogCacheReady:Promise<unknown>|undefined;
function restoreCatalogs():Promise<unknown>{
 return catalogCacheReady??=Promise.all(([['osm',valid],['usfs',validUsfs],['hk',validHk],['nzdoc',validNzdoc],['parkscanada',validParksCanada],['nsw-npws',validNswNpws],['england',validEngland],['wales',validWales],['scotland-argyll',validScotlandArgyll],['ni-midulster',validNiMidulster],['norfolk-prow',validNorfolk],['cambridgeshire-prow',validCambridgeshire],['victoria-recreation-tracks',validVictoria]] as const).map(async([source,validator])=>{
 const data=await readCatalogCache(source,validator);if(!data)return;
 if(source==='osm')apply(data);
 else if(source==='hk')applyHk(data);
 else if(source==='nzdoc')applyNzdoc(data);
 else if(source==='parkscanada')applyParksCanada(data);
 else if(source==='nsw-npws')applyNswNpws(data);
 else if(source==='england')applyEngland(data);
 else if(source==='wales')applyWales(data);
 else if(source==='scotland-argyll')applyScotlandArgyll(data);
 else if(source==='ni-midulster')applyNiMidulster(data);
 else if(source==='norfolk-prow')applyNorfolk(data);
 else if(source==='cambridgeshire-prow')applyCambridgeshire(data);
 else if(source==='victoria-recreation-tracks')applyVictoria(data);
 else{latestUsfs=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk),...catalogRoutes(latestNzdoc),...catalogRoutes(latestParksCanada),...catalogRoutes(latestNswNpws),...catalogRoutes(latestEngland),...catalogRoutes(latestWales),...catalogRoutes(latestScotlandArgyll),...catalogRoutes(latestNiMidulster),...catalogRoutes(latestNorfolk),...catalogRoutes(latestCambridgeshire),...catalogRoutes(latestVictoria)];apply(latestOsm);}
 catalogCacheState[source]={saved:true,message:'已恢复上次保存目录'};
})).then(()=>{apply(latestOsm);});
}

const NPS_SOURCE_URL='https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails/FeatureServer/0';
const NPS_ATTRIBUTION='U.S. National Park Service, Public Trails dataset. NPS public-distribution data; no named layer-specific license. See source and NPS data disclaimer.';
const NPS_LICENSE='U.S. federal public-distribution dataset; no named layer-specific license';
function validNpsPublicTrails(data:any):boolean {
 const keys=['featureId','sourceStatus','surface','trailType','trailClass','trailUse','sourceEditedAt','sourceDate'];
 return data?.schemaVersion===1&&data.license===NPS_LICENSE&&data.attribution===NPS_ATTRIBUTION&&data.licenseUrl==='https://www.nps.gov/subjects/gisandmapping/data-disclaimers.htm'&&data.sourceUrl===NPS_SOURCE_URL&&typeof data.routeStatusPolicy==='string'&&data.routeStatusPolicy.length<=1200&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length<=50000&&Number.isInteger(data.sourceFeatureCount)&&data.sourceFeatureCount<=50000&&Number.isInteger(data.catalogRouteCount)&&data.catalogRouteCount>=data.routes.length&&Number.isInteger(data.withheldRecords)&&data.withheldRecords>=0&&data.sourceFeatureCount===data.catalogRouteCount+data.withheldRecords&&data.withheldReasons&&typeof data.withheldReasons==='object'&&Object.values(data.withheldReasons).every((v:any)=>Number.isInteger(v)&&v>=0)&&Object.values(data.withheldReasons).reduce((a:number,v:any)=>a+v,0)===data.withheldRecords&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags;
  return r&&typeof r.id==='string'&&/^nps-trail-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=500&&typeof r.region==='string'&&r.region.startsWith('美国·')&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===NPS_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&(r.status===undefined||r.status==='待核验')&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).length===keys.length&&Object.keys(tags).every((key:string)=>keys.includes(key))&&keys.every((key:string)=>tags[key]===null||typeof tags[key]==='string'&&tags[key].length<=300)&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));
 });
}
const VICTORIA_SOURCE_URL='https://opendata.maps.vic.gov.au/geoserver/wfs';
const VICTORIA_ATTRIBUTION='Contains Victorian Government data from Recreation Tracks, Department of Energy, Environment and Climate Action. Licensed under CC BY 4.0.';
function validVictoria(data:any):boolean{
 const keys=['assetClass','maintainedBy','walkingActivity','walkingComment','walkingGrade','walkingDistance','walkingDistanceUnit','walkingDuration','walkingDurationUnit','closureStatus','closureReason','sourceEditedAt'];
 return data?.schemaVersion===1&&data.license==='Creative Commons Attribution 4.0 International'&&data.attribution===VICTORIA_ATTRIBUTION&&data.licenseUrl==='https://creativecommons.org/licenses/by/4.0/'&&data.sourceUrl===VICTORIA_SOURCE_URL&&typeof data.routeStatusPolicy==='string'&&data.routeStatusPolicy.length<=1200&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length<=2000&&Number.isInteger(data.sourceFeatureCount)&&data.sourceFeatureCount>0&&data.sourceFeatureCount<=2000&&Number.isInteger(data.catalogRouteCount)&&data.catalogRouteCount>=data.routes.length&&Number.isInteger(data.withheldRecords)&&data.withheldRecords>=0&&data.sourceFeatureCount===data.catalogRouteCount+data.withheldRecords&&Number.isInteger(data.excludedNonWalkingRecords)&&data.excludedNonWalkingRecords>=0&&data.withheldReasons&&typeof data.withheldReasons==='object'&&Object.values(data.withheldReasons).every((v:any)=>Number.isInteger(v)&&v>=0)&&Object.values(data.withheldReasons).reduce((a:number,v:any)=>a+v,0)===data.withheldRecords&&data.routes.every((r:any)=>{const t=r?.sourceTags;return r&&typeof r.id==='string'&&/^vic-recreation-track-[A-Za-z0-9._-]{1,80}$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=500&&r.region==='澳大利亚·维多利亚州'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===VICTORIA_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&r.status==='待核验'&&t&&typeof t==='object'&&!Array.isArray(t)&&Object.keys(t).length===keys.length&&Object.keys(t).every((k:string)=>keys.includes(k))&&t.walkingActivity==='Y'&&Object.values(t).every((v:any)=>v===null||typeof v==='string'&&v.length<=300)&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));});
}
export function validCatalogSource(source:CatalogSource,data:any):boolean{return source==='osm'?valid(data):source==='usfs'?validUsfs(data):source==='hk'?validHk(data):source==='nzdoc'?validNzdoc(data):source==='parkscanada'?validParksCanada(data):source==='nsw-npws'?validNswNpws(data):source==='england'?validEngland(data):source==='wales'?validWales(data):source==='scotland-argyll'?validScotlandArgyll(data):source==='ni-midulster'?validNiMidulster(data):source==='norfolk-prow'?validNorfolk(data):source==='cambridgeshire-prow'?validCambridgeshire(data):source==='nps-public-trails'?validNpsPublicTrails(data):source==='victoria-recreation-tracks'?validVictoria(data):false;}
export function rememberDiscoveredRoute(route:typeof seed[number]):void{
 if(ROUTES.some(existing=>existing.id===route.id))return;
 extras.delete(route.id);extras.set(route.id,{...route,status:'待核验',openingExpiresAt:0});
 while(extras.size>200)extras.delete(extras.keys().next().value!);
 try{uni.setStorageSync('he_selected_catalog_routes_v1',[...extras.values()]);}catch{}
 apply(latestOsm);
}
