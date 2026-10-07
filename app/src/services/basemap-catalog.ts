export interface MapCatalogPack {name:string;label:string;url:string;bytes:number;sha256:string;attribution:string;license:string}
export function validateMapCatalog(value:unknown):MapCatalogPack[]{
 if(!Array.isArray(value)||!value.length||value.length>128)throw new Error('地图目录无效');
 const names=new Set<string>();let bytes=0;
 return value.map(row=>{
  if(!row||typeof row!=='object'||typeof row.name!=='string'||!/^[a-z0-9-]{1,80}\.pmtiles$/.test(row.name)||names.has(row.name)||row.url!==`static/offline-maps/${row.name}`||!Number.isSafeInteger(row.bytes)||row.bytes<127||row.bytes>64*1024*1024||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256)||typeof row.label!=='string'||!row.label.trim()||row.label.length>80||typeof row.attribution!=='string'||!row.attribution.trim()||row.attribution.length>300||row.license!=='ODbL-1.0 Produced Work')throw new Error('地图目录条目无效');
  names.add(row.name);bytes+=row.bytes;if(bytes>500_000_000)throw new Error('地图目录超过500 MB');
  return {name:row.name,label:row.label,url:row.url,bytes:row.bytes,sha256:row.sha256,attribution:row.attribution,license:row.license};
 });
}
export function createMapCatalog(seed:unknown,request:()=>Promise<string>,now=()=>Date.now()){
 let packs=validateMapCatalog(seed),next=0,pending:Promise<MapCatalogPack[]>|null=null;
 const snapshot=()=>packs.map(row=>({...row}));
 return {snapshot,refresh():Promise<MapCatalogPack[]>{
  if(pending)return pending.then(()=>snapshot());if(now()<next)return Promise.resolve(snapshot());
  pending=(async()=>{try{const text=await Promise.resolve().then(request);if(typeof text!=='string'||text.length>256*1024)throw new Error('地图目录过大');const updated=validateMapCatalog(JSON.parse(text));packs=updated;next=now()+3600000;return snapshot();}catch(error){next=now()+60000;throw error;}finally{pending=null;}})();return pending.then(()=>snapshot());
 }};
}
export function requestMapCatalog(base:string):Promise<string>{
 if(!/^(?:https:\/\/[a-z0-9.-]+(?::[0-9]+)?|http:\/\/(?:localhost|127\.0\.0\.1|tauri\.localhost)(?::[0-9]+)?|tauri:\/\/localhost)\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))return Promise.reject(new Error('地图目录地址不受支持'));
 const url=base+'static/offline-maps/catalog.json';
 return new Promise((resolve,reject)=>uni.request({url,method:'GET',timeout:15000,dataType:'text',responseType:'text',success:r=>{if(r.statusCode!==200||typeof r.data!=='string')reject(new Error('地图目录暂时无法更新，保留已有目录'));else resolve(r.data);},fail:()=>reject(new Error('地图目录暂时无法更新，保留已有目录'))}));
}
