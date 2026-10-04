import { reactive } from 'vue';
import { ROUTES as bundled, catalogRoutes } from '@shared/data/routes.catalog';
import { ROUTES as seed } from '@shared/data/routes.seed';
import usfs from '@shared/data/catalog/usfs.json';
let curated=[...seed,...catalogRoutes(usfs)];
let latestOsm: any = null;
const KEY='hiking-route-catalog-v1';
export const ROUTES=reactive([...bundled]);
const URL=import.meta.env.VITE_ROUTE_CATALOG_URL || 'https://raw.githubusercontent.com/hiking-earth/clients/main/shared/data/catalog/osm.json';
let lastAttempt=0; let inflight=false;
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
}
try {const cached=uni.getStorageSync(KEY); if(valid(cached)) apply(cached);} catch {}
export function refreshRouteCatalog(force=false): void {
  refreshUsfsCatalog();
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
    if(response.statusCode!==200 || data?.schemaVersion!==1 || data.attribution!=='USDA Forest Service' || !Array.isArray(data.routes) || data.routes.length>40000)return;
    if(!data.routes.every((r:any)=>typeof r.id==='string' && /^usfs-[\w-]+$/.test(r.id) && typeof r.name==='string' && r.name.length<=500 && typeof r.region==='string' && Array.isArray(r.center) && r.center.length===2 && r.center.every(Number.isFinite) && Math.abs(r.center[0])<=180 && Math.abs(r.center[1])<=90 && r.sourceUrl==='https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0' && typeof r.fetchedAt==='string' && r.sourceTags))return;
    curated=[...seed,...catalogRoutes(data)];
    apply(latestOsm || {routes:[]});
  }});
}
