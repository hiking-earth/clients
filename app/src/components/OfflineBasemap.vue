<template><view><text class="hint">{{message}}</text><view :id="containerId" class="basemap" /></view></template>
<script setup lang="ts">
import {nextTick,onUnmounted,ref,watch} from 'vue';
import {Map as LibreMap,NavigationControl,setWorkerUrl} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {openLocalBasemap,localBasemapStyle} from '@/services/local-basemap';
import {registerOfflineArchive,releaseOfflineArchive} from '@/services/offline-map-protocol';
setWorkerUrl(workerUrl);
const props=defineProps<{file:File|null}>();
const containerId=`offline-basemap-${Math.random().toString(36).slice(2)}`;
const message=ref('选择本机区域地图包');
let map:LibreMap|undefined,key='',generation=0,disposed=false;
function clear(){map?.remove();map=undefined;if(key)releaseOfflineArchive(key);key='';}
watch(()=>props.file,async file=>{
 const epoch=++generation;clear();
 if(!file){message.value='选择本机区域地图包';return;}
 message.value='读取本机区域地图…';
 try{
  const local=await openLocalBasemap(`file-${Date.now()}-${Math.random().toString(36).slice(2)}`,file.size,(offset,length)=>file.slice(offset,offset+length).arrayBuffer());
  await nextTick();if(disposed||generation!==epoch)return;
  registerOfflineArchive(local.archive);key=local.key;
  const {header}=local;
  const current=new LibreMap({container:containerId,style:localBasemapStyle(key),bounds:[[header.minLon,header.minLat],[header.maxLon,header.maxLat]],maxBounds:[[header.minLon,header.minLat],[header.maxLon,header.maxLat]],minZoom:header.minZoom,maxZoom:17,fitBoundsOptions:{padding:20},attributionControl:{compact:false}});
  map=current;current.addControl(new NavigationControl());
  current.on('load',()=>{if(!disposed&&generation===epoch)message.value='已读取本机道路与地物底图，可断网查看。此视图不含地名标签和高程。';});
  current.on('error',()=>{if(!disposed&&generation===epoch)message.value='部分地图内容读取失败，请保留地图包后重新选择。';});
 }catch(error){if(!disposed&&generation===epoch){clear();message.value=error instanceof Error?error.message:'本机地图打开失败';}}
},{immediate:true});
onUnmounted(()=>{disposed=true;generation++;clear();});
</script>
<style scoped>.hint{display:block;color:#aab9c5;font-size:13px;line-height:1.7;margin:12px 0}.basemap{height:420px;width:100%;border-radius:12px;overflow:hidden}</style>
