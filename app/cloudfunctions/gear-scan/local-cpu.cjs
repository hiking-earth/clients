const path=require('node:path');
let detector,busy=false;
const labels={backpack:['背包','背包'],handbag:['手提包','其他'],suitcase:['行李箱','其他'],bottle:['瓶状物（请确认用途）','饮食'],cup:['杯子','饮食'],bowl:['碗','饮食'],knife:['刀具','其他'],fork:['叉子','饮食'],spoon:['勺子','饮食'],'cell phone':['手机','导航'],umbrella:['雨伞','其他']};
function decodeImage(bytes){
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return require('jpeg-js').decode(bytes,{useTArray:true,maxResolutionInMP:4,maxMemoryUsageInMB:64});
 const png=Buffer.from([137,80,78,71,13,10,26,10]);
 if(bytes.length>=24&&bytes.subarray(0,8).equals(png)&&bytes.toString('ascii',12,16)==='IHDR'){
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width*height>4000000)throw Error('Image size');
  return require('pngjs').PNG.sync.read(bytes,{checkCRC:true});
 }
 throw Error('Unsupported image');
}
exports.main=async event=>{
 const image=event?.image;
 if(typeof image!=='string'||image.length>Math.ceil(4*1024*1024/3)*4||image.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(image))return {errMsg:'请选择4 MB以内的JPEG或PNG照片'};
 if(busy)return {errMsg:'识别服务正在处理其他照片，请稍后重试'};
 busy=true;
 try{
  const bytes=Buffer.from(image,'base64');if(bytes.length>4*1024*1024||bytes.toString('base64')!==image)return {errMsg:'照片编码无效或过大'};
  let decoded;try{decoded=decodeImage(bytes);}catch{return {errMsg:'请使用400万像素以内的JPEG或PNG照片；其他格式请先转换'};}
  if(!decoded.width||!decoded.height||decoded.width*decoded.height>4000000)return {errMsg:'照片尺寸过大，请压缩后重试'};
  const rgb=new Uint8Array(300*300*3);
  for(let y=0;y<300;y++)for(let x=0;x<300;x++){const from=(Math.floor(y*decoded.height/300)*decoded.width+Math.floor(x*decoded.width/300))*4;rgb.set(decoded.data.subarray(from,from+3),(y*300+x)*3);}
  if(!detector){const tf=require('@tensorflow/tfjs-core');require('@tensorflow/tfjs-backend-cpu');detector=require('./cpu-detector.cjs').createCpuDetector({tf,coco:require('@tensorflow-models/coco-ssd'),modelDirectory:path.join(__dirname,'model')});}
  const predictions=await detector(rgb);
  const items=predictions.filter(p=>labels[p.class]&&Number.isFinite(p.score)).map(p=>({name:`${labels[p.class][0]} · 候选 ${Math.round(p.score*100)}%`,category:labels[p.class][1]}));
  return {items,missing:[],usage:[items.length?'请逐项确认图像检测候选；分数不是准确率或质量认证。':'未检测到支持类别，不表示照片中没有装备。','免费自托管模型仅支持部分通用物体，不能判断鞋服材质、性能或完整装备。','下列为通用一日徒步核对清单，不是从照片推断缺失；按路线天气和本人需求调整。'],plan:['饮用水及补给','适合路面的鞋袜','防雨及保暖层','离线轨迹及备用电源','急救用品','头灯','紧急联系方式'].map(name=>({name}))};
 }finally{busy=false;}
};
