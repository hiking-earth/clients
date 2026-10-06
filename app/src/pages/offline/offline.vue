<template><scroll-view scroll-y class="page">
  <text class="title">离线资料</text><text class="hint">本机轨迹可离线查看。本页可导入你有权使用的WGS84 GeoJSON道路或边界资料，不下载商业地图瓦片，不含地形高程。</text>
  <view v-for="layer in layers" :key="layer.id" class="card"><text class="title">{{ layer.name }}</text><text class="hint">{{ layer.attribution }} · {{ layer.license }} · {{ (layer.bytes/1024).toFixed(0) }} KB</text><button @click="activate(layer.id)">{{ active === layer.id ? '正在使用' : '用于轨迹与导航示意' }}</button><button @click="remove(layer.id)">删除资料</button></view>
  <TrackCanvas v-if="preview" :points="[]" :layers="preview.paths" :attribution="preview.attribution" />
  <text class="title">官方参考资料</text><button :disabled="downloading" @click="downloadHk">{{downloading ? '下载中…' : '下载香港郊野公园官方步道参考线'}}</button><text class="hint">来源：香港政府渔农自然护理署 / DATA.GOV.HK。参考线不包含底图、高程或当前开放许可；下载后可离线叠加查看。</text>
  <text class="title">导入资料</text>
  <!-- #ifdef APP-PLUS --><button @click="chooseNative">从系统文件选择</button><!-- #endif -->
  <!-- #ifdef H5 --><button @click="choose">选择 JSON 资料</button><!-- #endif -->
  <!-- #ifdef MP-WEIXIN --><button @click="chooseWechat">从聊天文件选择 JSON</button><!-- #endif -->
  <textarea v-model="source" :maxlength="5242880" placeholder="粘贴离线资料JSON内容" class="input" /><button @click="save">导入并保存</button><text class="hint">{{ message }}</text>
  <text class="hint">格式：format=hiking-earth-offline-v1，name、attribution、license均必填，geometry为GeoJSON FeatureCollection；支持LineString/MultiLineString/Polygon/MultiPolygon。每份最多5 MB、50000点，总量8 MB。导入后不会上传。</text>
</scroll-view></template>
<script setup lang="ts">
import {publicSnapshot} from '@/services/public-data';
import { chooseNativeText } from '@/services/files';
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import TrackCanvas from '@/components/TrackCanvas.vue';
import { offlineLayers, importOfflineLayer, deleteOfflineLayer, selectOfflineLayer, restoreOfflineLayers } from '@/services/offline';
const downloading=ref(false);
async function downloadHk(){if(downloading.value)return;downloading.value=true;message.value='';try{const text=JSON.stringify(await publicSnapshot('offline-hk'));const layer=await importOfflineLayer(text);selectOfflineLayer(layer.id);load();message.value='官方参考线已保存，可离线查看';}catch(e:any){message.value=e.message;}finally{downloading.value=false;}}
const layers = ref(offlineLayers()), active = ref(String(uni.getStorageSync('he_offline_active') || '')), source = ref(''), message = ref('');
const preview = computed(() => layers.value.find(p => p.id === active.value));
async function load() { await restoreOfflineLayers();layers.value = offlineLayers(); active.value = String(uni.getStorageSync('he_offline_active') || ''); }
onShow(load);
function activate(id: string) { selectOfflineLayer(id); load(); }
function remove(id: string) { uni.showModal({ title: '删除离线资料', content: '删除这份本机资料？不影响轨迹文件。', success: async r => { if (r.confirm) { try { await deleteOfflineLayer(id); await load(); } catch { message.value = '删除失败'; } } } }); }
async function save() { try { const layer = await importOfflineLayer(source.value); selectOfflineLayer(layer.id); source.value = ''; load(); message.value = '已保存到本机'; } catch (e) { message.value = e instanceof Error ? e.message : '导入失败'; } }
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
