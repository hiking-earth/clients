import { reactive } from 'vue';
import { ROUTES as bundled, catalogRoutes } from '@shared/data/routes.catalog';
import { ROUTES as seed } from '@shared/data/routes.seed';
import usfs from '@shared/data/catalog/usfs.json';
import osm from '@shared/data/catalog/osm.json';
import hk from '@shared/data/catalog/hk-afcd.json';
let latestUsfs:any=usfs,latestHk:any=hk;
let curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk)];
let latestOsm: any = osm;
const KEY='hiking-route-catalog-v1';
export const ROUTES=reactive([...bundled]);
const URL=import.meta.env.VITE_ROUTE_CATALOG_URL || 'https://raw.githubusercontent.com/hiking-earth/clients/main/shared/data/catalog/osm.json';
let lastAttempt=0; let inflight=false;
const listeners=new Set<()=>void>();
export function onRouteCatalogChange(callback:()=>void):()=>void {listeners.add(callback);return ()=>listeners.delete(callback);}
function valid(data: any): boolean {
  return data?.schemaVersion===1 && data.license==='ODbL-1.0' && typeof data.generatedAt==='string' && Number.isFinite(Date.parse(data.generatedAt)) && Array.isArray(data.routes) && data.routes.length<=40000 && data.routes.every((r:any)=>
    typeof r.id==='string' && /^osm-relation-\d+$/.test(r.id) && typeof r.name==='string' && r.name.length<=500 && typeof r.region==='string' && Array.isArray(r.center) && r.center.length===2 && r.center.every(Number.isFinite) && Math.abs(r.center[0])<=180 && Math.abs(r.center[1])<=90 && /^https:\/\/www\.openstreetmap\.org\/relation\/\d+$/.test(r.sourceUrl) && typeof r.fetchedAt==='string' && r.sourceTags && typeof r.sourceTags==='object');
}
function apply(data:any) {
  latestOsm=data;
  const names=new Set(curated.map(r=>r.name.normalize('NFKC').toLowerCase().replace(/[\s·—_-]/g,'')+':'+r.center.map((v:number)=>v.toFixed(1)).join(',')));
  const ids=new Set(curated.map(r=>r.id));
  const fresh=catalogRoutes(data).filter(r=>{const key=r.name.normalize('NFKC').toLowerCase().replace(/[\s·—_-]/g,'')+':'+r.center.map((v:number)=>v.toFixed(1)).join(',');if(names.has(key)||ids.has(r.id))return false;names.add(key);ids.add(r.id);return true;});
  ROUTES.splice(0,ROUTES.length,...curated,...fresh);
  listeners.forEach(callback=>callback());
}
try {const cached=uni.getStorageSync(KEY); if(valid(cached)) apply(cached);} catch {}
export function refreshRouteCatalog(force=false): void {
  refreshUsfsCatalog();
  refreshHkCatalog();
  if(inflight || (!force && Date.now()-lastAttempt<6*60*60*1000))return;
  if(!/^https:\/\//.test(URL))return;
  inflight=true;lastAttempt=Date.now();
  uni.request({url:URL,timeout:20000,success(response){
    const data=response.data;
    if(response.statusCode!==200 || !valid(data))return;
    // Preserve a valid in-memory result if local storage reaches quota.
    apply(data); try{uni.setStorageSync(KEY,data);}catch{}
  },complete(){inflight=false;}});
}

let lastUsfsAttempt=0;
export function refreshUsfsCatalog(): void {
  if(Date.now()-lastUsfsAttempt<6*60*60*1000)return;
  lastUsfsAttempt=Date.now();
  const url=import.meta.env.VITE_USFS_CATALOG_URL || 'https://raw.githubusercontent.com/hiking-earth/clients/main/shared/data/catalog/usfs.json';
  if(!/^https:\/\//.test(url))return;
  uni.request({url,timeout:20000,success(response){
    const data=response.data as any;
    if(response.statusCode!==200 || !validUsfs(data))return;
    try{uni.setStorageSync(KEY+'-usfs',data);}catch{}
    latestUsfs=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk)];
    apply(latestOsm || {routes:[]});
  }});
}

function validUsfs(data:any): boolean {
    if(data?.schemaVersion!==1 || data.attribution!=='USDA Forest Service' || typeof data.generatedAt!=='string' || !Number.isFinite(Date.parse(data.generatedAt)) || !Array.isArray(data.routes) || data.routes.length>40000)return false;
    if(!data.routes.every((r:any)=>typeof r.id==='string' && /^usfs-[\w-]+$/.test(r.id) && typeof r.name==='string' && r.name.length<=500 && typeof r.region==='string' && Array.isArray(r.center) && r.center.length===2 && r.center.every(Number.isFinite) && Math.abs(r.center[0])<=180 && Math.abs(r.center[1])<=90 && r.sourceUrl==='https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0' && typeof r.fetchedAt==='string' && r.sourceTags))return false;
    return true;
}
try {const cached=uni.getStorageSync(KEY+'-usfs');if(validUsfs(cached)){latestUsfs=cached;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk)];apply(latestOsm || {routes:[]});}}catch{}

function validHk(data:any):boolean {return data?.schemaVersion===1&&data.license==='DATA.GOV.HK-terms-1.2'&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.routes)&&data.routes.length<=2000&&data.routes.every((r:any)=>typeof r.id==='string'&&/^hk-afcd-\d+$/.test(r.id)&&typeof r.name==='string'&&Array.isArray(r.center)&&r.center.length===2&&r.center.every(Number.isFinite)&&Math.abs(r.center[0])<=180&&Math.abs(r.center[1])<=90&&r.sourceUrl==='https://portal.csdi.gov.hk/server/rest/services/common/afcd_rcd_1665568199103_4360/FeatureServer/0'&&r.sourceTags&&Array.isArray(r.referencePaths)&&r.referencePaths.length<=100&&r.referencePaths.every((path:any)=>Array.isArray(path)&&path.length<=151&&path.every((point:any)=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90)));}
function applyHk(data:any){latestHk=data;curated=[...seed,...catalogRoutes(latestUsfs),...catalogRoutes(latestHk)];apply(latestOsm);}
try{const cached=uni.getStorageSync(KEY+'-hk');if(validHk(cached))applyHk(cached);}catch{}
let lastHkAttempt=0;
export function refreshHkCatalog():void {if(Date.now()-lastHkAttempt<6*60*60*1000)return;lastHkAttempt=Date.now();uni.request({url:'https://raw.githubusercontent.com/hiking-earth/clients/main/shared/data/catalog/hk-afcd.json',timeout:20000,success:r=>{if(r.statusCode!==200||!validHk(r.data))return;applyHk(r.data);try{uni.setStorageSync(KEY+'-hk',r.data);}catch{}}});}
