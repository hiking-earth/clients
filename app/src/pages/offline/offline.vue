<template><scroll-view scroll-y class="page">
  <text class="title">离线资料</text><text class="hint">本机轨迹可离线查看。本页可导入你有权使用的WGS84 GeoJSON道路或边界资料，不下载商业地图瓦片，不含地形高程。</text>
  <view v-for="layer in layers" :key="layer.id" class="card"><text class="title">{{ layer.name }}</text><text class="hint">{{ layer.attribution }} · {{ layer.license }} · {{ (layer.bytes/1024).toFixed(0) }} KB</text><button :disabled="busy" @click="activate(layer.id)">{{ active === layer.id ? '正在使用' : '用于轨迹与导航示意' }}</button><button :disabled="busy" @click="remove(layer.id)">删除资料</button></view>
  <TrackCanvas v-if="preview" :points="[]" :layers="preview.paths" :attribution="preview.attribution" />
  <!-- #ifdef H5 -->
  <text class="title">区域离线底图</text><button :disabled="busy" @click="chooseBasemap">打开本机PMTiles地图包</button><text class="hint">支持最多64 MB的PMTiles v3矢量地图包。本机读取，不上传；当前为道路和地物视图，导入后保存到本机，总量最多192 MiB。浏览器清理站点数据会删除地图，请保留原包。</text><view v-for="pack in availableBasemaps" :key="pack.name" class="card"><text>{{pack.label}} · {{(pack.bytes/1048576).toFixed(2)}} MiB</text><text class="hint">{{pack.attribution}} · {{pack.license}}。仅底图，不代表步道开放许可。</text><button :disabled="busy" @click="downloadMapPack(pack)">下载并保存区域地图</button></view><view v-for="pack in savedBasemaps" :key="pack.id" class="card"><text>{{pack.name}} · {{(pack.bytes/1048576).toFixed(2)}} MiB</text><button :disabled="busy" @click="basemapFile=pack.blob">查看地图</button><button :disabled="busy" @click="removeBasemap(pack.id)">删除地图包</button></view><OfflineBasemap v-if="basemapFile" :file="basemapFile" />
  <!-- #endif -->
  <text class="title">全球离线概览</text><button :disabled="busy" @click="saveWorld">保存全球陆地轮廓到本机</button><text class="hint">内置 Natural Earth 公共领域全球陆地轮廓（1:110m），无需联网即可保存和查看。仅供全球概览，不含详细道路、地形高程和导航信息。</text>
  <text class="title">官方参考资料</text><button :disabled="busy" @click="downloadHk">{{downloading ? '下载中…' : '下载香港郊野公园官方步道参考线'}}</button><text class="hint">来源：香港政府渔农自然护理署 / DATA.GOV.HK。参考线不包含底图、高程或当前开放许可；下载后可离线叠加查看。</text>
  <view class="card"><text>前台自动更新已下载的官方参考线</text><switch :checked="offlineUpdateState.enabled" @change="toggleOfficialUpdates" /><text class="hint">默认关闭；开启后联网检查，会使用网络流量。只更新已有官方参考线，删除后不会自动重新下载。{{offlineUpdateState.message}}</text></view>
  <text class="title">导入资料</text>
  <!-- #ifdef APP-PLUS --><button @click="chooseNative">从系统文件选择</button><!-- #endif -->
  <!-- #ifdef H5 --><button @click="choose">选择 JSON 资料</button><!-- #endif -->
  <!-- #ifdef MP-WEIXIN --><button @click="chooseWechat">从聊天文件选择 JSON</button><!-- #endif -->
  <textarea v-model="source" :maxlength="5242880" placeholder="粘贴离线资料JSON内容" class="input" /><button :disabled="busy" @click="save">导入并保存</button><text class="hint">{{ message }}</text>
  <text class="hint">格式：format=hiking-earth-offline-v1，name、attribution、license均必填，geometry为GeoJSON FeatureCollection；支持LineString/MultiLineString/Polygon/MultiPolygon。每份最多5 MB、50000点，总量8 MB。导入后不会上传。</text>
</scroll-view></template>
<script setup lang="ts">
import {offlineUpdateState,setOfficialOfflineUpdates} from '@/services/offline-updates';
import {publicSnapshot} from '@/services/public-data';
import { chooseNativeText } from '@/services/files';
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import TrackCanvas from '@/components/TrackCanvas.vue';
import { offlineLayers, importOfflineLayer, deleteOfflineLayer, selectOfflineLayer, restoreOfflineLayers } from '@/services/offline';
import world from '@/data/offline-world.json';
// #ifdef H5
import OfflineBasemap from '@/components/OfflineBasemap.vue';
import availableBasemaps from '@/data/basemap-packs.json';
import {downloadBasemap,type BasemapDownload} from '@/services/basemap-download';
async function downloadMapPack(pack:BasemapDownload){if(busy.value)return;mutating.value=true;try{const file=await downloadBasemap(pack,new URL(import.meta.env.BASE_URL,location.href).href,undefined,bytes=>{message.value=`地图下载 ${(bytes/1048576).toFixed(2)} MiB`;});const saved=await saveBasemap(file);await refreshBasemaps();basemapFile.value=saved.blob;message.value='地图已校验并保存';}catch(e){message.value=e instanceof Error?e.message:'地图下载失败';}finally{mutating.value=false;}}
import {listBasemaps,saveBasemap,deleteBasemap,type SavedBasemap} from '@/services/basemap-store';
const basemapFile=ref<Blob|null>(null),savedBasemaps=ref<SavedBasemap[]>([]);
async function refreshBasemaps(){try{savedBasemaps.value=await listBasemaps();}catch(e){message.value=e instanceof Error?e.message:'地图目录读取失败';}}
onShow(refreshBasemaps);
function chooseBasemap(){const input=document.createElement('input');input.type='file';input.accept='.pmtiles';input.onchange=async()=>{const file=input.files?.[0];if(!file||busy.value)return;mutating.value=true;try{const saved=await saveBasemap(file);await refreshBasemaps();basemapFile.value=saved.blob;message.value='地图包已保存到本机';}catch(e){message.value=e instanceof Error?e.message:'地图保存失败';}finally{mutating.value=false;}};input.click();}
function removeBasemap(id:string){uni.showModal({title:'删除地图包',content:'仅删除本机副本，请保留原始地图文件。',success:async result=>{if(!result.confirm||busy.value)return;mutating.value=true;try{await deleteBasemap(id);basemapFile.value=null;await refreshBasemaps();}catch(e){message.value=e instanceof Error?e.message:'删除失败';}finally{mutating.value=false;}}});}
// #endif
async function saveWorld(){if(busy.value)return;mutating.value=true;try{const layer=await importOfflineLayer(JSON.stringify(world));await useSavedLayer(layer.id,'全球陆地轮廓已保存，可离线查看');}catch(e){message.value=e instanceof Error?e.message:'全球轮廓保存失败';}finally{mutating.value=false;}}
function toggleOfficialUpdates(event:any){try{setOfficialOfflineUpdates(event.detail.value===true);}catch{message.value='未能保存自动更新设置';}}
const downloading=ref(false),mutating=ref(false);
const busy=computed(()=>downloading.value||mutating.value);
async function useSavedLayer(id:string,success:string){
 try{selectOfflineLayer(id);message.value=success;}catch{message.value='资料已保存，但未能设为当前图层；请重新点击使用';}
 await load();
}
async function downloadHk(){if(busy.value)return;downloading.value=true;message.value='';try{const text=JSON.stringify(await publicSnapshot('offline-hk'));const layer=await importOfflineLayer(text,'hk-afcd');await useSavedLayer(layer.id,'官方参考线已保存，可离线查看');}catch(e:any){message.value=e.message;}finally{downloading.value=false;}}
const layers = ref(offlineLayers()), active = ref(String(uni.getStorageSync('he_offline_active') || '')), source = ref(''), message = ref('');
const preview = computed(() => layers.value.find(p => p.id === active.value));
async function load() { await restoreOfflineLayers();layers.value = offlineLayers(); active.value = String(uni.getStorageSync('he_offline_active') || ''); }
onShow(load);
async function activate(id: string) { if(busy.value)return;try{selectOfflineLayer(id);await load();message.value='已设为当前图层';}catch(e){message.value=e instanceof Error?e.message:'设置图层失败';} }
function remove(id: string) { if(busy.value)return;uni.showModal({ title: '删除离线资料', content: '删除这份本机资料？不影响轨迹文件。', success: async r => { if (r.confirm&&!busy.value) { mutating.value=true;try { await deleteOfflineLayer(id); await load();message.value='资料已删除'; } catch { message.value = '删除失败，原资料已保留'; } finally{mutating.value=false;} } } }); }
async function save() { if(busy.value)return;mutating.value=true;const text=source.value;try { const layer = await importOfflineLayer(text); if(source.value===text)source.value = ''; await useSavedLayer(layer.id,'已保存到本机'); } catch (e) { message.value = e instanceof Error ? e.message : '导入失败'; } finally{mutating.value=false;} }
async function chooseNative() { try { const text = await chooseNativeText(); if (text !== null) source.value = text; } catch (e) { message.value = e instanceof Error ? e.message : '文件读取失败'; } }
// #ifdef H5
function choose() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.geojson,application/json';
  input.onchange = async () => { const file = input.files?.[0]; if (!file) return; if (file.size > 5*1024*1024) { message.value = '资料超过5 MB'; return; } try { source.value = await file.text(); } catch { message.value = '读取失败'; } }; input.click();
}
// #endif
// #ifdef MP-WEIXIN
function chooseWechat() { uni.chooseMessageFile({ count: 1, type: 'file', extension: ['json','geojson'], success: r => {
  const file = r.tempFiles[0]; if (file.size > 5*1024*1024) { message.value = '资料超过5 MB'; return; }
  uni.getFileSystemManager().readFile({ filePath: file.path, encoding: 'utf8', success: r => { source.value = String(r.data); }, fail: () => { message.value = '读取失败'; } });
} }); }
// #endif
</script>
<style scoped>.page{height:100vh;padding:24px 20px;box-sizing:border-box;background:#0f141b;color:#eef4ea}.title{display:block;font-size:20px}.hint{display:block;font-size:13px;color:#8a97a5;line-height:1.7;margin:12px 0}.card{padding:16px;border-radius:12px;background:#151d27;margin-bottom:16px}.input{width:100%;height:220px;box-sizing:border-box;padding:12px;background:#202b37;margin:16px 0}button{background:#b8f36b;margin:12px 0;font-size:14px}</style>
