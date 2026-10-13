import {callCloud} from './cloud';
import {catalogRoutes} from '@shared/data/routes.catalog';
import type {HikingRoute} from '@shared/types/route';
import {validCatalogSource} from './route-catalog';
import type {CatalogSource} from './catalog-cache';
export type CatalogSearchPage={routes:HikingRoute[];total:number;offset:number;hasMore:boolean;snapshot:string};
export type PublicCatalogSource=CatalogSource|'nps-public-trails';
const NPS_SOURCE_URL='https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails/FeatureServer/0';
const NPS_ATTRIBUTION='U.S. National Park Service, Public Trails dataset. NPS public-distribution data; no named layer-specific license. See source and NPS data disclaimer.';
const NPS_LICENSE='U.S. federal public-distribution dataset; no named layer-specific license';
function validNpsPublicTrails(data:any):boolean{
 const keys=['featureId','sourceStatus','surface','trailType','trailClass','trailUse','sourceEditedAt','sourceDate'];
 return data?.schemaVersion===1&&data.license===NPS_LICENSE&&data.attribution===NPS_ATTRIBUTION&&data.licenseUrl==='https://www.nps.gov/subjects/gisandmapping/data-disclaimers.htm'&&data.sourceUrl===NPS_SOURCE_URL&&typeof data.routeStatusPolicy==='string'&&data.routeStatusPolicy.length<=1200&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length<=50000&&Number.isInteger(data.sourceFeatureCount)&&data.sourceFeatureCount<=50000&&Number.isInteger(data.catalogRouteCount)&&data.catalogRouteCount>=data.routes.length&&Number.isInteger(data.withheldRecords)&&data.withheldRecords>=0&&data.sourceFeatureCount===data.catalogRouteCount+data.withheldRecords&&data.withheldReasons&&typeof data.withheldReasons==='object'&&Object.values(data.withheldReasons).every((v:any)=>Number.isInteger(v)&&v>=0)&&Object.values(data.withheldReasons).reduce((a:number,v:any)=>a+v,0)===data.withheldRecords&&data.routes.every((r:any)=>{
  const tags=r?.sourceTags;
  return r&&typeof r.id==='string'&&/^nps-trail-[1-9]\d*$/.test(r.id)&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=500&&typeof r.region==='string'&&r.region.startsWith('美国·')&&Array.isArray(r.center)&&r.center.length===2&&r.center.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl===NPS_SOURCE_URL&&Number.isFinite(Date.parse(r.fetchedAt))&&r.status==='待核验'&&tags&&typeof tags==='object'&&!Array.isArray(tags)&&Object.keys(tags).length===keys.length&&Object.keys(tags).every((key:string)=>keys.includes(key))&&keys.every((key:string)=>tags[key]===null||typeof tags[key]==='string'&&tags[key].length<=300)&&Array.isArray(r.referencePaths)&&r.referencePaths.length>0&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every((v:any)=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90));
 });
}
export async function searchPublicCatalog(source:PublicCatalogSource,query:string,offset=0,snapshot?:string):Promise<CatalogSearchPage>{
 const term=query.trim();if(term.length<2||term.length>100)throw new Error('请输入2至100个字符');
 const result=await callCloud<any>('catalog-feed',{source,action:'search',query:term,offset,...(snapshot?{snapshot}:{})});
 const data=result.data;
 const metadata={...data?.metadata,routes:data?.items};
 const valid=source==='nps-public-trails'?validNpsPublicTrails(metadata):validCatalogSource(source,metadata);
 if(!result.ok||!data||!/^([a-f0-9]{64})$/.test(data.snapshot)||snapshot&&data.snapshot!==snapshot||data.offset!==offset||!Number.isInteger(data.total)||data.total<0||data.total>250000||!Array.isArray(data.items)||data.items.length>20||data.hasMore!==(offset+data.items.length<data.total)||!valid)throw new Error(result.errMsg||'来源检索暂不可用，请稍后重试');
 return {routes:catalogRoutes({...data.metadata,routes:data.items}),total:data.total,offset,hasMore:data.hasMore,snapshot:data.snapshot};
}
