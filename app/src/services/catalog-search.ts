import {callCloud} from './cloud';
import {catalogRoutes} from '@shared/data/routes.catalog';
import type {HikingRoute} from '@shared/types/route';
import {validCatalogSource} from './route-catalog';
import type {CatalogSource} from './catalog-cache';
export type CatalogSearchPage={routes:HikingRoute[];total:number;offset:number;hasMore:boolean;snapshot:string};
export async function searchPublicCatalog(source:CatalogSource,query:string,offset=0,snapshot?:string):Promise<CatalogSearchPage>{
 const term=query.trim();if(term.length<2||term.length>100)throw new Error('请输入2至100个字符');
 const result=await callCloud<any>('catalog-feed',{source,action:'search',query:term,offset,...(snapshot?{snapshot}:{})});
 const data=result.data;
 if(!result.ok||!data||!/^([a-f0-9]{64})$/.test(data.snapshot)||snapshot&&data.snapshot!==snapshot||data.offset!==offset||!Number.isInteger(data.total)||data.total<0||data.total>250000||!Array.isArray(data.items)||data.items.length>20||data.hasMore!==(offset+data.items.length<data.total)||!validCatalogSource(source,{...data.metadata,routes:data.items}))throw new Error(result.errMsg||'来源检索暂不可用，请稍后重试');
 return {routes:catalogRoutes({...data.metadata,routes:data.items}),total:data.total,offset,hasMore:data.hasMore,snapshot:data.snapshot};
}
