/** Binary range access for callback-based native file managers. No text/base64 conversion. */
export interface BinaryFileManager {
 readFile(options:{filePath:string;position:number;length:number;success:(result:{data:unknown})=>void;fail:()=>void}):void;
}
export function isLocalMapPath(path:unknown):path is string{
 return typeof path==='string'&&path.length>0&&path.length<=1024&&!/[\x00-\x1f?#]/.test(path)&&!path.split('/').includes('..')&&(!/^https?:\/\//i.test(path)||/^http:\/\/(?:usr|tmp)\//.test(path));
}
export function fileRangeReader(manager:BinaryFileManager,filePath:string,bytes:number){
 if(!isLocalMapPath(filePath)||!Number.isSafeInteger(bytes)||bytes<127||bytes>64*1024*1024)throw new Error('本机地图文件无效');
 return (offset:number,length:number):Promise<ArrayBuffer>=>new Promise((resolve,reject)=>{
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||offset>=bytes||length<1||length>8*1024*1024){reject(new Error('地图读取范围无效'));return;}
  const count=Math.min(length,bytes-offset);
  try{manager.readFile({filePath,position:offset,length:count,success:result=>{
   if(!(result.data instanceof ArrayBuffer)||result.data.byteLength!==count){reject(new Error('地图文件读取不完整'));return;}resolve(result.data);
  },fail:()=>reject(new Error('本机地图文件读取失败'))});}catch{reject(new Error('本机地图文件读取失败'));}
 });
}
