<template><scroll-view scroll-y class="page" :scroll-into-view="mapScrollTarget" scroll-with-animation>
  <text class="title">离线资料</text><text class="hint">本机轨迹可离线查看。本页可导入你有权使用的WGS84 GeoJSON道路或边界资料，不下载商业地图瓦片，不含地形高程。</text>
  <view v-for="layer in layers" :key="layer.id" class="card"><text class="title">{{ layer.name }}</text><text class="hint">{{ layer.attribution }} · {{ layer.license }} · {{ (layer.bytes/1024).toFixed(0) }} KB</text><button :disabled="busy" @click="activate(layer.id)">{{ active === layer.id ? '正在使用' : '用于轨迹与导航示意' }}</button><button :disabled="busy" @click="remove(layer.id)">删除资料</button></view>
  <TrackCanvas v-if="preview" :points="[]" :layers="preview.paths" :attribution="preview.attribution" />
  <!-- #ifdef H5 || MP-WEIXIN -->
  <view class="card"><text class="title">查找位置的离线地图</text><view class="map-coordinates"><view><text class="map-coordinate-label">纬度</text><input class="map-coordinate-input" v-model="mapLatitude" placeholder="例如 22.23" /></view><view><text class="map-coordinate-label">经度</text><input class="map-coordinate-input" v-model="mapLongitude" placeholder="例如 113.95" /></view></view><button :disabled="busy" @click="filterMapLocation">查找覆盖此位置的地图</button><text v-if="mapLocationMessage" class="hint">{{mapLocationMessage}}</text><button v-if="mapLocation" :disabled="busy" @click="mapLocation=null;mapLocationMessage=''">显示全部地区</button><text v-if="mapLocation" class="hint">仅显示目录中已生成、覆盖此位置的地图。没有结果时，该位置尚无可下载包；全球概览不含详细道路。</text></view>
  <!-- #endif -->
  <!-- #ifdef H5 -->
  <text class="title">区域离线底图</text><button :disabled="busy" @click="chooseBasemap">打开本机PMTiles地图包</button><text class="hint">支持最多64 MB的PMTiles v3矢量地图包。本机读取，不上传；当前为道路和地物视图，导入后保存到本机，总量最多192 MiB。浏览器清理站点数据会删除地图，请保留原包。</text><view v-for="pack in visibleBasemaps" :key="pack.name" class="card"><text>{{pack.label}} · {{(pack.bytes/1048576).toFixed(2)}} MiB</text><text class="hint">{{pack.attribution}} · {{pack.license}}。仅底图，不代表步道开放许可。</text><button :disabled="busy" @click="downloadMapPack(pack)">下载并保存区域地图</button></view><view v-for="pack in savedBasemaps" :key="pack.id" class="card"><text>{{pack.name}} · {{(pack.bytes/1048576).toFixed(2)}} MiB</text><button :disabled="busy" @click="viewSavedBasemap(pack.blob)">查看地图</button><button :disabled="busy" @click="removeBasemap(pack.id)">删除地图包</button></view><view v-if="basemapFile" id="offline-map-preview"><OfflineBasemap :file="basemapFile" /></view>
  <!-- #endif -->
  <!-- #ifdef MP-WEIXIN -->
  <text class="title">区域离线底图</text><view v-for="pack in visibleWechatMaps" :key="pack.name" class="card"><text>{{pack.label}} · {{(pack.bytes/1048576).toFixed(2)}} MiB</text><text class="hint">{{pack.attribution}} · {{pack.license}}</text><button :disabled="busy" @click="downloadWechatMap(pack)">下载并保存区域地图</button></view><button :disabled="busy" @click="chooseWechatBasemap">从聊天文件保存PMTiles地图</button><text class="hint">每包最多64 MB，总量最多192 MiB，保存在微信本机文件中、不上传。微信清理数据可能删除地图，请保留原包。</text><view v-for="pack in wechatSavedMaps" :key="pack.id" class="card"><text>{{pack.name}} · {{(pack.bytes/1048576).toFixed(2)}} MiB</text><text v-if="pack.issue" class="hint">{{pack.issue}}</text><button :disabled="busy||!pack.available" @click="viewWechatBasemap(pack.id)">查看地图</button><button :disabled="busy" @click="removeWechatBasemap(pack.id)">删除地图包</button></view><view v-if="wechatBasemap" id="offline-map-preview"><WechatBasemap :key="wechatBasemap.path" :file-path="wechatBasemap.path" :bytes="wechatBasemap.bytes" /></view>
  <!-- #endif -->
  <text class="title">全球离线概览</text><button :disabled="busy" @click="saveWorld">保存全球陆地轮廓到本机</button><text class="hint">内置 Natural Earth 公共领域全球陆地轮廓（1:110m），无需联网即可保存和查看。仅供全球概览，不含详细道路、地形高程和导航信息。</text>
  <text class="title">官方参考资料</text><button :disabled="busy" @click="downloadHk">{{downloading ? '下载中…' : '下载香港郊野公园官方步道参考线'}}</button><text class="hint">来源：香港政府渔农自然护理署 / DATA.GOV.HK。参考线不包含底图、高程或当前开放许可；下载后可离线叠加查看。</text>
  <view class="card"><text>前台自动更新已下载的官方参考线</text><switch color="#b8f36b" :checked="offlineUpdateState.enabled" @change="toggleOfficialUpdates" /><text class="hint">默认关闭；开启后联网检查，会使用网络流量。只更新已有官方参考线，删除后不会自动重新下载。{{offlineUpdateState.message}}</text></view>
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
import { computed, ref, watch, nextTick } from 'vue';
const mapScrollTarget=ref('');
// #ifdef H5 || MP-WEIXIN
import {mapsCoveringLocation} from '@/services/basemap-catalog';
const mapLocationMessage=ref('');
const mapLatitude=ref(''),mapLongitude=ref(''),mapLocation=ref<{latitude:number;longitude:number}|null>(null);
function filterMapLocation(){try{if(!mapLatitude.value.trim()||!mapLongitude.value.trim())throw new Error('请填写经度和纬度');const latitude=Number(mapLatitude.value),longitude=Number(mapLongitude.value);mapsCoveringLocation([],latitude,longitude);mapLocation.value={latitude,longitude};mapLocationMessage.value='位置筛选已更新';}catch(e){mapLocationMessage.value=e instanceof Error?e.message:'位置无效';}}
// #endif
async function revealMap(){mapScrollTarget.value='';await nextTick();mapScrollTarget.value='offline-map-preview';}
import { onShow } from '@dcloudio/uni-app';
import TrackCanvas from '@/components/TrackCanvas.vue';
import { offlineLayers, importOfflineLayer, deleteOfflineLayer, selectOfflineLayer, restoreOfflineLayers } from '@/services/offline';
import world from '@/data/offline-world.json';
// #ifdef H5
import OfflineBasemap from '@/components/OfflineBasemap.vue';
import bundledBasemaps from '@/data/basemap-packs.json';
import {createMapCatalog,requestMapCatalog,mapDistributionBase} from '@/services/basemap-catalog';
import {isDesktop,requestDesktopMapCatalog,requestDesktopMapDownload} from '@/services/desktop';
const mapBase=mapDistributionBase(isDesktop(),new URL(import.meta.env.BASE_URL,location.href).href);
const mapCatalog=createMapCatalog(bundledBasemaps,()=>isDesktop()?requestDesktopMapCatalog():requestMapCatalog(mapBase));
const availableBasemaps=ref(mapCatalog.snapshot());
const visibleBasemaps=computed(()=>mapLocation.value?mapsCoveringLocation(availableBasemaps.value,mapLocation.value.latitude,mapLocation.value.longitude):availableBasemaps.value);
onShow(async()=>{try{availableBasemaps.value=await mapCatalog.refresh();}catch{message.value='地图目录暂时无法更新，保留已有目录';}});
import {downloadBasemap,downloadDesktopBasemap,type BasemapDownload} from '@/services/basemap-download';
async function downloadMapPack(pack:BasemapDownload){if(busy.value)return;mutating.value=true;message.value='正在下载并校验地图，请稍候';try{const file=isDesktop()?await downloadDesktopBasemap(pack,requestDesktopMapDownload):await downloadBasemap(pack,mapBase,undefined,bytes=>{message.value=`地图下载 ${(bytes/1048576).toFixed(2)} MiB`;});const saved=await saveBasemap(file);await refreshBasemaps();basemapFile.value=saved.blob;message.value='地图已校验并保存';}catch(e){message.value=e instanceof Error?e.message:'地图下载失败';}finally{mutating.value=false;}}
import {listBasemaps,saveBasemap,deleteBasemap,type SavedBasemap} from '@/services/basemap-store';
const basemapFile=ref<Blob|null>(null),savedBasemaps=ref<SavedBasemap[]>([]);
function viewSavedBasemap(file:Blob){basemapFile.value=file;void revealMap();}
watch(basemapFile,file=>{if(file)void revealMap();});
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
import WechatBasemap from '@/components/WechatBasemap.vue';
import bundledWechatMaps from '@/data/basemap-packs.json';
import {createMapCatalog as createWechatCatalog,requestMapCatalog as requestWechatCatalog} from '@/services/basemap-catalog';
const wechatCatalog=createWechatCatalog(bundledWechatMaps,()=>requestWechatCatalog('https://hiking-earth.nanyu20050927.chatgpt.site/client-app/'));
const wechatAvailableMaps=ref(wechatCatalog.snapshot());
const visibleWechatMaps=computed(()=>mapLocation.value?mapsCoveringLocation(wechatAvailableMaps.value,mapLocation.value.latitude,mapLocation.value.longitude):wechatAvailableMaps.value);
onShow(async()=>{try{wechatAvailableMaps.value=await wechatCatalog.refresh();}catch{message.value='地图目录暂时无法更新，保留已有目录';}});
import {downloadWechatBasemap,type MapDownloadPack} from '@/services/wechat-basemap-download';
import {verifyBasemapDigest} from '@/services/basemap-digest';
async function downloadWechatMap(pack:MapDownloadPack){if(busy.value)return;mutating.value=true;try{const existing=await wechatMapStore.find(pack.name,pack.bytes);if(existing){message.value='正在校验已有地图';await verifyBasemapDigest(fileRangeReader(uni.getFileSystemManager(),existing.path,existing.bytes),existing.bytes,pack.sha256);wechatBasemap.value={path:existing.path,bytes:existing.bytes};message.value='已有地图校验通过，已直接打开，无需重复下载';return;}const file=await downloadWechatBasemap(uni,pack,(n,stage)=>{message.value=`地图${stage==='verify'?'校验':'下载'} ${(n/1048576).toFixed(2)} MiB`;});const saved=await wechatMapStore.save(file.path,file.bytes,pack.name);await refreshWechatMaps();wechatBasemap.value={path:saved.path,bytes:saved.bytes};message.value='地图已校验并保存到本机';}catch(e){message.value=e instanceof Error?e.message:'地图下载失败';}finally{mutating.value=false;}}

const wechatBasemap=ref<{path:string;bytes:number}|null>(null);
watch(wechatBasemap,file=>{if(file)void revealMap();});
import {createWechatMapStore,type WechatMapView} from '@/services/wechat-basemap-store';
import {fileRangeReader} from '@/services/basemap-file-reader';
import {openLocalBasemap} from '@/services/local-basemap';
const wechatSavedMaps=ref<WechatMapView[]>([]);
const wechatMapStore=createWechatMapStore(uni,(path,bytes)=>openLocalBasemap('wechat-validate',bytes,fileRangeReader(uni.getFileSystemManager(),path,bytes)));
async function viewWechatBasemap(id:string){if(busy.value)return;mutating.value=true;message.value='正在读取已保存地图';try{const packs=await wechatMapStore.list();wechatSavedMaps.value=packs;const pack=packs.find(row=>row.id===id);if(!pack)throw new Error('地图不在本机目录中');if(!pack.available)throw new Error(pack.issue||'地图暂时无法读取，请保留原包');wechatBasemap.value={path:pack.path,bytes:pack.bytes};}catch(error){message.value=error instanceof Error?error.message:'地图读取失败';}finally{mutating.value=false;}}
async function refreshWechatMaps(){try{wechatSavedMaps.value=await wechatMapStore.list();}catch(e){message.value=e instanceof Error?e.message:'地图目录恢复失败';}}
onShow(refreshWechatMaps);
function chooseWechatBasemap(){if(busy.value)return;uni.chooseMessageFile({count:1,type:'file',extension:['pmtiles'],success:async r=>{const file=r.tempFiles[0];if(!file||!Number.isSafeInteger(file.size)||file.size<127||file.size>64*1024*1024){message.value='地图包无效或超过64 MB';return;}mutating.value=true;try{const saved=await wechatMapStore.save(file.path,file.size,file.name||'区域地图');await refreshWechatMaps();wechatBasemap.value={path:saved.path,bytes:saved.bytes};message.value='地图包已保存到本机';}catch(e){message.value=e instanceof Error?e.message:'地图保存失败';}finally{mutating.value=false;}},fail:()=>{message.value='未打开地图文件';}});}
function removeWechatBasemap(id:string){if(busy.value)return;uni.showModal({title:'删除地图包',content:'删除本机地图副本？请保留原始地图包。',success:async r=>{if(!r.confirm||busy.value)return;mutating.value=true;try{await wechatMapStore.remove(id);wechatBasemap.value=null;await refreshWechatMaps();message.value='地图已删除';}catch(e){message.value=e instanceof Error?e.message:'地图删除失败';}finally{mutating.value=false;}}});}

function chooseWechat() { uni.chooseMessageFile({ count: 1, type: 'file', extension: ['json','geojson'], success: r => {
  const file = r.tempFiles[0]; if (file.size > 5*1024*1024) { message.value = '资料超过5 MB'; return; }
  uni.getFileSystemManager().readFile({ filePath: file.path, encoding: 'utf8', success: r => { source.value = String(r.data); }, fail: () => { message.value = '读取失败'; } });
} }); }
// #endif
</script>
<style scoped>.page{height:100vh;padding:24px 20px;box-sizing:border-box;background:#01030a;color:#f4f8f2}.title{display:block;font-size:20px}.hint{display:block;font-size:13px;color:#a7b5aa;line-height:1.7;margin:12px 0}.card{padding:16px;border-radius:12px;background:#050c12;margin-bottom:16px}.input{width:100%;height:220px;box-sizing:border-box;padding:12px;background:#202b37;margin:16px 0}button{background:#b8f36b;color:#01030a;margin:12px 0;font-size:14px}.map-coordinates{display:flex;gap:12px;margin-top:16px}.map-coordinates>view{flex:1;min-width:0}.map-coordinate-label{display:block;font-size:13px;color:#a7b5aa;margin-bottom:6px}.map-coordinate-input{height:44px;border:1px solid #33413c;border-radius:8px;padding:0 12px;background:#101922;color:#f4f8f2;font-size:16px;box-sizing:border-box}</style>
