<template>
  <scroll-view scroll-y class="page">
    <text class="hint">云端轨迹仅供当前账号查看。恢复到本机会保留云端副本。</text>
    <text v-if="error" class="error">{{ error }}</text>
    <button @click="reload" :disabled="busy">刷新</button>
    <view v-for="t in rows" :key="t.trackId" class="card">
      <text>{{ t.name }} · {{ (t.distanceM / 1000).toFixed(2) }} km</text>
      <button :disabled="busy" @click="restore(t.trackId)">恢复到本机</button>
      <button :disabled="busy" @click="remove(t.trackId)">删除云端副本</button>
    </view>
    <text v-if="!rows.length && !error && !busy">暂无云端轨迹</text>
    <button v-if="hasMore" :disabled="busy" @click="load">加载更多</button>
  </scroll-view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { callCloud } from '@/services/cloud';
import { getTrack, saveTrack, setTrackAutoSyncExcluded } from '@/services/tracks';
import type { TrackRecord } from '@shared/types/track';
type Row = { trackId: string; name: string; distanceM: number };
const rows = ref<Row[]>([]), busy = ref(false), error = ref(''), hasMore = ref(false);
let page = 0;
let visible=true;
const currentOwner=()=>String(uni.getStorageSync('he_openid')||'');
onShow(()=>{visible=true;});
onUnload(()=>{visible=false;rows.value=[];});
onLoad(reload);
async function load() {
  if (busy.value) return;
  busy.value = true;
  const owner=currentOwner();
  const res = await callCloud<{ tracks: Row[]; hasMore: boolean }>('track-manage', { action: 'list', page });
  busy.value = false;
  if(!visible||owner!==currentOwner()){rows.value=[];page=0;return;}
  if (!res.ok || !res.data) { error.value = res.errMsg ?? '加载失败'; return; }
  error.value = ''; page++; hasMore.value = res.data.hasMore;
  for (const t of res.data.tracks) if (!rows.value.some(r => r.trackId === t.trackId)) rows.value.push(t);
}
function reload() { if (busy.value) return; rows.value = []; page = 0; void load(); }
function confirm(title: string, content: string) { return new Promise<boolean>(resolve => uni.showModal({ title, content, success: r => resolve(r.confirm === true), fail: () => resolve(false) })); }
async function restore(id: string) {
  if (busy.value) return;
  const owner=currentOwner();
  const baseline=JSON.stringify(getTrack(id));
  if (getTrack(id) && !await confirm('覆盖本机同名轨迹？', '本机已有相同 ID 的轨迹，恢复将用云端副本替换。')) return;
  if(owner!==currentOwner())return;
  busy.value = true;
  try {
    const res = await callCloud<{ track: TrackRecord }>('track-manage', { action: 'get', trackId: id });
    if (!res.ok || !res.data) throw new Error(res.errMsg ?? '恢复失败');
    if(!visible||owner!==currentOwner())return;
    if(JSON.stringify(getTrack(id))!==baseline)throw new Error('本机轨迹已变化，请重新确认恢复');
    saveTrack(res.data.track);
    setTrackAutoSyncExcluded(id,false);
    uni.showToast({ title: '已恢复到本机', icon: 'success' });
  } catch (e) { error.value = e instanceof Error ? e.message : '保存失败'; }
  finally { busy.value = false; }
}
async function remove(id: string) {
  const owner=currentOwner();
  if (busy.value || !await confirm('删除云端轨迹？', '云端副本将永久删除，本机轨迹保留。')) return;
  busy.value = true;
  if(owner!==currentOwner()){busy.value=false;return;}
  const res = await callCloud('track-manage', { action: 'delete', trackId: id });
  busy.value = false;
  if(!visible||owner!==currentOwner())return;
  if (!res.ok) { error.value = res.errMsg ?? '删除失败'; return; }
  setTrackAutoSyncExcluded(id,true);
  const local = getTrack(id); if (local) saveTrack({ ...local, synced: false });
  reload();
}
</script>
<style scoped>
.page { box-sizing: border-box; padding: 32rpx; background: #0f141b; color: #eef4ea; min-height: 100vh; }
.hint { display: block; margin-bottom: 24rpx; color: #8a97a5; }
.card { padding: 24rpx; margin: 24rpx 0; background: #151d27; border-radius: 16rpx; }
button { margin-top: 16rpx; background: #1a2430; color: #b8f36b; }
.error { color: #ff7b72; }
</style>
