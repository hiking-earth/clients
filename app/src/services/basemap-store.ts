import {openLocalBasemap} from './local-basemap';
export interface SavedBasemap {id:string;name:string;bytes:number;savedAt:number;blob:Blob}
export const BASEMAP_BUDGET=192*1024*1024;
let database:Promise<IDBDatabase>|undefined;
function open():Promise<IDBDatabase>{
 if(database)return database;
 database=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('hiking-earth-basemaps',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('maps',{keyPath:'id'});
  request.onerror=()=>reject(new Error('无法打开地图数据库'));
  request.onblocked=()=>reject(new Error('地图数据库被其他窗口占用'));
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=undefined;};resolve(db);};
 }).catch(error=>{database=undefined;throw error;});return database;
}
export async function listBasemaps():Promise<SavedBasemap[]>{
 const db=await open();return new Promise((resolve,reject)=>{
  const tx=db.transaction('maps','readonly'),request=tx.objectStore('maps').getAll();
  tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(new Error('地图目录读取失败'));tx.onabort=()=>reject(new Error('地图目录读取中断'));
 });
}
export async function saveBasemap(file:File):Promise<SavedBasemap>{
 await openLocalBasemap('validate-import',file.size,(offset,length)=>file.slice(offset,offset+length).arrayBuffer());
 const item:SavedBasemap={id:crypto.randomUUID(),name:file.name.slice(0,120),bytes:file.size,savedAt:Date.now(),blob:file};
 const db=await open();await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction('maps','readwrite'),store=tx.objectStore('maps'),request=store.getAll();
  let failure='地图保存失败，可能设备空间不足';
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error(failure));tx.onabort=()=>reject(new Error(failure));
  request.onsuccess=()=>{const total=request.result.reduce((sum:number,row:SavedBasemap)=>sum+row.bytes,0);if(!Number.isSafeInteger(total)||total+item.bytes>BASEMAP_BUDGET){failure='区域地图总量超过192 MiB，请先删除不再使用的地图';tx.abort();return;}store.add(item);};
 });return item;
}
export async function deleteBasemap(id:string):Promise<void>{
 const db=await open();return new Promise((resolve,reject)=>{
  const tx=db.transaction('maps','readwrite');tx.objectStore('maps').delete(id);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('地图删除失败'));tx.onabort=()=>reject(new Error('地图删除中断'));
 });
}
