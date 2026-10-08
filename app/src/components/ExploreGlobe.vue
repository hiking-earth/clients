<template>
 <view class="globe-shell">
  <canvas :id="textureId" :canvas-id="textureId" class="earth-photo" :style="photoStyle" />
  <canvas :id="id" :canvas-id="id" class="globe-canvas" :style="{height:height+'px'}" @touchstart="start" @touchmove.stop.prevent="move" @touchend="end" @touchcancel="cancel" />
  <view class="globe-heading"><text class="eyebrow">EXPLORE THE EARTH</text><text class="globe-title">从地球，出发。</text><text class="globe-sub">拖动探索 · 点击路线光点</text></view>
  <view class="globe-tools"><button class="globe-tool" aria-label="放大地球" @click="zoomBy(1.2)">＋</button><button class="globe-tool" aria-label="缩小地球" @click="zoomBy(1/1.2)">−</button><button class="globe-tool reset" @click="reset">全球</button></view>
  <text class="globe-credit">NASA Earth Observatory · 历史卫星合成影像</text>
 </view>
</template>
<script setup lang="ts">
import {getCurrentInstance,onMounted,onUnmounted,nextTick,watch,ref} from 'vue';
import {renderEarth} from './earth-texture-renderer';
import {projectGlobe,rotateGlobe} from './globe-projection';
import {globePoint} from './globe-input';
const props=defineProps<{routes:{id:string;center:[number,number]}[];selectedId?:string}>();
const emit=defineEmits<{(e:'select',id:string):void}>();
const id='earth-'+Math.random().toString(36).slice(2,9),instance=getCurrentInstance();
const resolution=uni.getSystemInfoSync().windowWidth<600?320:512;
const textureId=id+'-photo',photoStyle=ref<Record<string,string>>({width:resolution+'px',height:resolution+'px',left:'0px',top:'0px'});
const height=ref(400);let width=400,lon=100,lat=22,zoom=1,disposed=false,queued=false;
let touch:{x:number;y:number}|null=null,origin:{x:number;y:number}|null=null,moved=false,pinch=0;
let hits:{id:string;x:number;y:number}[]=[];
let canvasBounds={left:0,top:0};
function point(e:any,ending=false){
 // #ifdef H5
 const rect=nativeCanvas?.getBoundingClientRect();if(rect)canvasBounds={left:rect.left,top:rect.top};
 // #endif
 return globePoint(e,canvasBounds,ending);
}
function distance(e:any){const [a,b]=e.touches||[];return a&&b?Math.hypot((a.clientX??a.x)-(b.clientX??b.x),(a.clientY??a.y)-(b.clientY??b.y)):0;}
function start(e:any){touch=point(e);origin=touch;moved=false;pinch=distance(e);}
function move(e:any){if(!touch)return;const p=point(e),d=distance(e);if(!p)return;if(d&&pinch){zoom=Math.max(.8,Math.min(3,zoom*d/pinch));moved=true;}else{const v=rotateGlobe(lon,lat,p.x-touch.x,p.y-touch.y,Math.min(width,height.value)/2);lon=v.lon;lat=v.lat;if(origin&&Math.hypot(p.x-origin.x,p.y-origin.y)>5)moved=true;}touch=p;pinch=d;schedule();}
function mouseStart(e:any){start(e);}
function mouseMove(e:any){if(e.buttons===1)move(e);}
function cancel(){touch=null;origin=null;pinch=0;}
function end(e:any){if(!moved&&touch){const p=point(e,true);const h=p&&hits.find(h=>Math.hypot(h.x-p.x,h.y-p.y)<16);if(h)emit('select',h.id);}cancel();}
function wheel(e:any){e.preventDefault?.();zoomBy(e.deltaY>0?.92:1.08);}
function zoomBy(f:number){zoom=Math.max(.8,Math.min(3,zoom*f));schedule();}
function reset(){lon=100;lat=22;zoom=1;schedule();}
function schedule(){if(queued||disposed)return;queued=true;setTimeout(()=>{queued=false;if(!disposed)draw();},16);}
function draw(){
 const ctx=uni.createCanvasContext(id,instance?.proxy),h=height.value,cx=width/2,cy=width<600?h*.60:h/2+12,r=Math.min(width*.43,h*(width<600?.32:.39))*zoom;
 ctx.clearRect(0,0,width,h);
 photoStyle.value={width:resolution+'px',height:resolution+'px',left:(cx-r)+'px',top:(cy-r)+'px',transform:'scale('+2*r/resolution+')'};
 const rgba=renderEarth(resolution,lon,lat);
 void nextTick(()=>{if(!disposed)uni.canvasPutImageData({canvasId:textureId,x:0,y:0,width:resolution,height:resolution,data:rgba,fail:()=>{}},instance?.proxy);});
 hits=[];const cells=new Set<string>();for(const route of props.routes){const v=projectGlobe(route.center[0],route.center[1],lon,lat);if(v.z<.04)continue;const x=cx+v.x*r,y=cy-v.y*r,key=Math.floor(x/18)+':'+Math.floor(y/18);if(cells.has(key)&&route.id!==props.selectedId)continue;cells.add(key);if(hits.length>=240)break;hits.push({id:route.id,x,y});ctx.beginPath();ctx.arc(x,y,route.id===props.selectedId?6:3,0,Math.PI*2);ctx.setFillStyle(route.id===props.selectedId?'#f6d995':'#f3c763');ctx.fill();}
 ctx.draw();
}
async function measure(){await nextTick();uni.createSelectorQuery().in(instance?.proxy).select('#'+id).boundingClientRect((v:any)=>{if(v?.width){width=v.width;canvasBounds={left:v.left,top:v.top};schedule();}}).exec();}
function resize(){const w=uni.getSystemInfoSync();height.value=w.windowWidth>=800?Math.max(440,w.windowHeight-90):340;void measure();}
// #ifdef H5
let nativeCanvas:HTMLElement|null=null;
const mouseBindings=[['mousedown',mouseStart],['mousemove',mouseMove],['mouseup',end],['mouseleave',cancel],['wheel',wheel]] as const;
// #endif
onMounted(async()=>{resize();uni.onWindowResize(resize);
 // #ifdef H5
 await nextTick();nativeCanvas=document.getElementById(id);for(const [name,handler] of mouseBindings)nativeCanvas?.addEventListener(name,handler as EventListener,{passive:false});
 // #endif
});onUnmounted(()=>{disposed=true;uni.offWindowResize(resize);
 // #ifdef H5
 for(const [name,handler] of mouseBindings)nativeCanvas?.removeEventListener(name,handler as EventListener);nativeCanvas=null;
 // #endif
});watch(()=>props.routes,schedule,{deep:false});watch(()=>props.selectedId,()=>{const route=props.routes.find(r=>r.id===props.selectedId);if(route){lon=route.center[0];lat=route.center[1];}schedule();});
</script>
<style scoped>
.globe-shell{position:relative;width:100%;overflow:hidden;background:#01030a;border-radius:24px}.earth-photo{position:absolute;transform-origin:top left;pointer-events:none;border-radius:50%;box-shadow:0 0 20px rgba(63,180,205,.3),0 15px 45px rgba(27,91,89,.15)}.globe-canvas{position:relative;width:100%;touch-action:none}.globe-heading{position:absolute;left:28px;top:28px;pointer-events:none}.eyebrow{display:block;font-size:10px;letter-spacing:3px;color:#b8f36b}.globe-title{display:block;margin-top:8px;font-size:28px;font-weight:600;color:#f4f8f2}.globe-sub{display:block;font-size:12px;color:#a7b5aa;margin-top:8px}.globe-tools{position:absolute;right:18px;bottom:42px;display:flex;gap:6px}.globe-tool{width:36px;height:36px;line-height:34px;padding:0;margin:0;background:#050c12;color:#f4f8f2;border:1px solid #29323a;border-radius:10px;font-size:20px}.reset{width:52px;font-size:12px}.globe-credit{position:absolute;bottom:16px;left:20px;font-size:10px;color:#a7b5aa}
@media(max-width:600px){.globe-heading{left:20px;top:16px}.globe-title{font-size:24px}.globe-sub{font-size:11px}}
</style>
