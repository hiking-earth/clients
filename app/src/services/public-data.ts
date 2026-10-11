import {browserReportsOffline} from './network-state';
import {callCloud} from './cloud';
const CATALOG_PAGE_SIZE=400;
export async function publicSnapshot(source:'osm'|'usfs'|'hk'|'nzdoc'|'news'|'release'|'offline-hk'):Promise<any>{
 if(browserReportsOffline())throw new Error('当前设备离线，保留本机资料，联网后再更新');
 if(source==='release'||source==='offline-hk'){
  const result=await callCloud<{data:unknown}>('catalog-feed',{source});
  if(!result.ok||!result.data)throw new Error(result.errMsg||'公共资料更新失败');return result.data.data;
 }
 type CatalogPage={snapshot:string;key:string;total:number;metadata:any;items:any[];hasMore:boolean;page:number};
 const loadPage=async(page:number,snapshot?:string):Promise<CatalogPage>=>{
  // Read-only page retries keep the same snapshot; validation failures below
  // are never retried or accepted as a different version.
  let result:{ok:boolean;data?:CatalogPage;errMsg?:string}={ok:false};
  for(let attempt=0;attempt<3;attempt++){
   try{result=await callCloud<CatalogPage>('catalog-feed',{source,page,windowLimit:40000,...(snapshot?{snapshot}:{})});}
   catch{result={ok:false,errMsg:'公共资料请求未完成'};}
   if(result.ok||attempt===2||result.errMsg==='操作过于频繁，请稍后重试')break;
   await new Promise<void>(resolve=>setTimeout(resolve,1000*(attempt+1)));
  }
  const data=result.data;
  if(!result.ok||!data||!Array.isArray(data.items)||data.page!==page||data.items.length>CATALOG_PAGE_SIZE||!Number.isInteger(data.total)||data.total<0||data.total>40000||!/^([a-f0-9]{64})$/.test(data.snapshot)||typeof data.key!=='string')throw new Error(result.errMsg||'资料页无效，保留本机资料');
  if(data.hasMore!==((page+1)*CATALOG_PAGE_SIZE<data.total))throw new Error('资料分页状态无效');
  return data;
 };
 const first=await loadPage(0),snapshot=first.snapshot,key=first.key,total=first.total,metadata=first.metadata;
 if(!['routes','items'].includes(key))throw new Error('资料类型无效');
 const items:any[]=[...first.items],pageCount=Math.ceil(total/CATALOG_PAGE_SIZE);
 for(let start=1;start<pageCount;start+=8){
  const pageNumbers=Array.from({length:Math.min(8,pageCount-start)},(_,index)=>start+index);
  const pages=await Promise.all(pageNumbers.map(page=>loadPage(page,snapshot)));
  for(let index=0;index<pages.length;index++){
   const page=pageNumbers[index],data=pages[index];
   if(data.page!==page||data.snapshot!==snapshot||data.total!==total||data.key!==key)throw new Error('资料正在更新，将在下一轮重试');
   items.push(...data.items);
  }
 }
 if(items.length!==total)throw new Error('资料尚未完整取得');
 return {...metadata,[key]:items};
}
