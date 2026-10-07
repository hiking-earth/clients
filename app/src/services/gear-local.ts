// #ifdef H5
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
import * as coco from '@tensorflow-models/coco-ssd';
// #endif
export type LocalGearResult={items:{name:string;category:string}[];missing:{name:string;reason:string}[];usage:string[];plan:{name:string}[]};
const labels:Record<string,[string,string]>={backpack:['背包','背包'],handbag:['手提包','其他'],suitcase:['行李箱','其他'],bottle:['瓶状物（请确认用途）','饮食'],cup:['杯子','饮食'],bowl:['碗','饮食'],knife:['刀具','其他'],fork:['叉子','饮食'],spoon:['勺子','饮食'],'cell phone':['手机','导航'],umbrella:['雨伞','其他']};
// #ifdef H5
let model:Promise<coco.ObjectDetection>|undefined;
let tail:Promise<void>=Promise.resolve();
async function detector(){
 if(!model)model=(async()=>{try{await tf.setBackend('webgl');}catch{await tf.setBackend('cpu');}await tf.ready();return coco.load({base:'lite_mobilenet_v2',modelUrl:`${import.meta.env.BASE_URL}models/gear/model.json`});})().catch(error=>{model=undefined;throw error;});
 return model!;
}
// #endif
export async function analyzeGearLocally(path:string):Promise<LocalGearResult>{
 // #ifdef H5
 const previous=tail;let release!:()=>void;tail=new Promise<void>(resolve=>{release=resolve;});await previous;
 let objectUrl='';
 try{
  if(!path.startsWith('blob:')&&!/^data:image\/(jpeg|png|webp|gif);base64,/.test(path))throw new Error('请从本机相册重新选择照片');
  const blob=await fetch(path,{signal:AbortSignal.timeout(15000)}).then(r=>r.blob());
  if(blob.size>4*1024*1024)throw new Error('请选择4 MB以内的照片');
  objectUrl=URL.createObjectURL(blob);const image=new Image();image.src=objectUrl;await image.decode();
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>24_000_000)throw new Error('图片尺寸过大，请压缩后重试');
  const canvas=document.createElement('canvas');canvas.width=300;canvas.height=300;
  const context=canvas.getContext('2d');if(!context)throw new Error('当前设备不支持本机图像分析');context.drawImage(image,0,0,300,300);
  const predictions=await(await detector()).detect(canvas,20,0.55);
  const items=predictions.filter(p=>labels[p.class]).map(p=>({name:`${labels[p.class][0]} · 候选 ${Math.round(p.score*100)}%`,category:labels[p.class][1]}));
  return {items,missing:[],usage:[items.length?'请逐项确认图像检测候选；概率不是正确率或质量认证。':'未检测到支持的装备类别，不表示照片中没有装备。','本机模型仅支持通用物体，不能完整识别鞋靴、衣物材质、药品或装备性能。','以下是一日徒步通用核对清单，不是根据照片判断缺失；请按路线、天气和本人需求调整。'],plan:['饮用水及补给','适合路面的鞋袜','防雨及保暖层','离线轨迹及备用电源','急救用品','头灯','紧急联系方式'].map(name=>({name}))};
 }finally{if(objectUrl)URL.revokeObjectURL(objectUrl);release();}
 // #endif
 // #ifndef H5
 throw new Error('当前平台尚未提供本机图像检测');
 // #endif
}
