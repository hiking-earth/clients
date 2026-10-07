<template>
  <view class="page">
    <!-- 记录面板 -->
    <view class="panel">
      <view class="stats">
        <view class="stat"><text class="stat-v">{{ (distanceM / 1000).toFixed(2) }}</text><text class="stat-k">里程 km</text></view>
        <view class="stat"><text class="stat-v">{{ elapsedText }}</text><text class="stat-k">用时</text></view>
        <view class="stat"><text class="stat-v">{{ ascentM.toFixed(0) }}</text><text class="stat-k">爬升 m</text></view>
        <view class="stat"><text class="stat-v">{{ speedText }}</text><text class="stat-k">速度 km/h</text></view>
      </view>

      <view class="controls">
        <button v-if="state === 'idle'" class="btn start" :disabled="!tracksValid" @click="start">开始记录</button>
        <template v-else-if="state === 'recording'">
          <button class="btn pause" @click="pause()">暂停</button>
          <button class="btn stop" :disabled="!tracksValid" @click="finish">结束</button>
        </template>
        <template v-else-if="state === 'paused'">
          <button class="btn start" :disabled="!tracksValid" @click="resume">继续</button>
          <button class="btn stop" :disabled="!tracksValid" @click="finish">结束</button>
        </template>
      </view>
      <text v-if="state !== 'idle'" class="hint">{{ state === 'recording' ? backgroundOn ? '后台记录已开启' : '记录中…请保持应用在前台' : '已暂停' }} · {{ points.length }} 个轨迹点</text>
    </view>

    <text v-if="!tracksValid" class="privacy-note">本机轨迹列表格式异常，已停用新记录、导入和保存，防止覆盖原始定位资料。现有有效记录仅供查看；请勿清理应用数据。</text>
    <text v-if="backgroundCacheWarning" class="privacy-note">{{ backgroundCacheWarning }}</text>
    <button :disabled="!tracksValid" @click="openImport">导入 GPX</button>
    <view v-if="state==='idle'&&unassignedDraft" class="privacy-note"><text>发现一条匿名或未记录账号归属的旧轨迹草稿，默认隐藏。</text><button @click="claimLegacyDraft">确认归属后恢复草稿</button></view>
    <text v-if="hiddenTrackCount" class="privacy-note">另有 {{ hiddenTrackCount }} 条其他账号或未归属轨迹在本机隐藏。需要转存时请到“我的 → 云同步全部轨迹”逐步确认。</text>
    <!-- 历史轨迹 -->
    <scroll-view scroll-y class="list">
      <view class="group-title">我的轨迹（{{ tracks.length }}）</view>
      <view v-for="t in tracks" :key="t.id" class="card" @click="goDetail(t.id)">
        <view class="card-l">
          <text class="card-name">{{ t.name }}</text>
          <text class="card-meta">{{ (t.distanceM / 1000).toFixed(1) }} km · {{ t.points.length }} 点 · {{ formatDate(t.startedAt) }}</text>
        </view>
        <text v-if="t.synced" class="synced">已同步</text>
      </view>
      <view v-if="tracks.length === 0 && tracksValid" class="empty">还没有轨迹，点上方「开始记录」</view>
      <view v-else-if="tracks.length === 0" class="empty">轨迹列表异常，原始资料已保留；请勿清理应用数据</view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import {validTrackPoint} from '@shared/types/track';
import { beginBackground, stopBackgroundRecording, backgroundRecording, backgroundSupported, pendingBackground, acknowledgeBackgroundPoints } from '@/services/background';
import { onAccountChange } from '@/services/account';
import { hasPrivacyConsent } from '@/services/privacy';
import { onUnmounted, ref } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import { haversineM } from "@shared/api/navigation-core";
import type { TrackPoint, TrackRecord } from "@shared/types/track";
import { startLocationUpdates, stopLocationUpdates } from "@/services/location";
import { onPrivacyChange } from "@/services/privacy";
import { listTracks, listCurrentOwnerTracks, saveTrack, loadDraft, saveDraft, clearDraft, currentTrackOwner, currentLocalTrackOwner, hasUnassignedDraft, claimUnassignedDraft, trackStorageValid } from "@/services/tracks";

const state = ref<"idle" | "recording" | "paused">("idle");
const points = ref<TrackPoint[]>([]);
const distanceM = ref(0);
const ascentM = ref(0);
const descentM = ref(0);
const elapsedText = ref("0:00");
const speedText = ref("0.0");
const tracks = ref<TrackRecord[]>([]);
const backgroundOn = ref(false);
const hiddenTrackCount=ref(0),unassignedDraft=ref(false),tracksValid=ref(trackStorageValid()),backgroundCacheWarning=ref('');
let flushingBackground = false;

let startedAt = 0;
let recordOwner = '';
let activeMs = 0;
let resumedAt = 0;
let segmentStart = true;
let starting = false;
let disposed = false;
let generation = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let lastAlt: number | null = null;

function refreshTrackList(){tracksValid.value=trackStorageValid();const all=listTracks();tracks.value=listCurrentOwnerTracks();hiddenTrackCount.value=all.length-tracks.value.length;unassignedDraft.value=hasUnassignedDraft();}
function applyDraft(draft:TrackRecord){
  points.value = draft.points;
  distanceM.value = draft.distanceM;
  ascentM.value = draft.ascentM;
  descentM.value = draft.descentM;
  startedAt = draft.startedAt;
  recordOwner = draft.localOwner || '';
  activeMs = draft.activeDurationMs ?? 0;
  state.value = "paused";
  stopBackgroundRecording();
  const buffered = pendingBackground(recordOwner, `t-${startedAt}`);
  if(buffered.invalid)backgroundCacheWarning.value='发现格式异常的后台定位缓存；为保留原始记录，未导入或清理该缓存。请勿清理应用数据。';
  if (buffered.session === `t-${startedAt}` && buffered.points.length) {
    // Restore saved native points only; recording stays paused after a restart.
    const last = points.value[points.value.length - 1]?.timestamp || startedAt;
    const end = Math.max(last, ...buffered.points.map(p => p.timestamp));
    activeMs += Math.max(0, end - last);
    state.value = 'recording'; flushBackground(); state.value = 'paused';
  }
  updateElapsed();
}
function restoreDraftForCurrentOwner(){if(state.value!=='idle')return;const draft=loadDraft();if(draft)applyDraft(draft);unassignedDraft.value=hasUnassignedDraft();}
function claimLegacyDraft(){
  if(!unassignedDraft.value)return;
  const owner=currentLocalTrackOwner();
  uni.showModal({title:'恢复匿名/未归属草稿？',content:'这条旧草稿没有账号归属或只属于匿名本机使用，可能包含其他使用者的定位记录。只有确认它属于你时才继续；恢复只会绑定到当前本机账号，不会上传云端。',success:choice=>{
    if(!choice.confirm||owner!==currentLocalTrackOwner())return;
    if(!claimUnassignedDraft(owner)){uni.showToast({title:'草稿已变化，未恢复',icon:'none'});return;}
    unassignedDraft.value=false;restoreDraftForCurrentOwner();
  }});
}
restoreDraftForCurrentOwner();
onShow(() => { refreshTrackList(); restoreDraftForCurrentOwner(); if (backgroundRecording()) flushBackground(); });
function duration() { return activeMs + (resumedAt ? Date.now() - resumedAt : 0); }
function updateElapsed() {
  const s = Math.floor(duration() / 1000);
  elapsedText.value = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function record(status: TrackRecord["state"]): TrackRecord {
  return {
    id: `t-${startedAt}`, name: `徒步 ${formatDate(startedAt)}`,
    ...(recordOwner ? { localOwner: recordOwner } : {}),
    points: points.value, distanceM: distanceM.value, ascentM: ascentM.value,
    descentM: descentM.value, activeDurationMs: duration(), startedAt,
    state: status, synced: false,
  };
}
function persist() {
  if (state.value === "idle") return false;
  try { saveDraft(record("paused")); return true; }
  catch (e: any) { tracksValid.value=trackStorageValid();pause(false); uni.showToast({ title: e?.message || "轨迹草稿保存失败，记录已暂停", icon: "none" }); return false; }
}
onHide(() => {
  if (state.value === "recording" && !backgroundRecording()) pause();
  else if (starting) { generation++; stopLocationUpdates(onPoint); }
});
const unsubscribePrivacy = onPrivacyChange((consents) => {
  if ((!consents.location || (backgroundOn.value && !consents.backgroundLocation)) && state.value === "recording") pause();
});

function onPoint(p: TrackPoint) {
  if (state.value !== "recording") return;
  if (!validTrackPoint(p) || p.timestamp>Date.now()+30000) return;
  const last = points.value[points.value.length - 1];
  if (last && p.timestamp <= last.timestamp) return;
  if (p.accuracy != null && p.accuracy > 60) return;
  if (points.value.length >= 20000) { pause(); uni.showToast({ title: '已达20000点，请先结束保存再开始新轨迹', icon: 'none' }); return; }
  if (last && !segmentStart && p.timestamp - last.timestamp > 60000 && haversineM(last, p) > 100) segmentStart = true;
  if (last && !segmentStart) {
    const d = haversineM(last, p);
    if (d < 2) return;         // 静止抖动过滤
    if (d > 100) return;       // 跳点过滤
    distanceM.value += d;
  }
  if (segmentStart) { p = { ...p, segmentStart: true }; lastAlt = null; segmentStart = false; }
  if (p.altitude != null && Number.isFinite(p.altitude)) {
    if (lastAlt != null && p.altitude > lastAlt) ascentM.value += p.altitude - lastAlt;
    if (lastAlt != null && p.altitude < lastAlt) descentM.value += lastAlt - p.altitude;
    lastAlt = p.altitude;
  }
  speedText.value = ((p.speed ?? 0) * 3.6).toFixed(1);
  points.value.push(p);
  if (!flushingBackground) persist();
}

function flushBackground() {
  if (flushingBackground || state.value !== 'recording') return;
  const buffered = pendingBackground(recordOwner, `t-${startedAt}`);
  if(buffered.invalid)backgroundCacheWarning.value='后台定位缓存格式异常；为保留原始记录，已停止导入和清理。请先保存当前草稿并保留应用数据。';
  if (buffered.session !== `t-${startedAt}` || !buffered.points.length) return;
  flushingBackground = true;
  try {
    const ordered = [...buffered.points].sort((a, b) => a.timestamp - b.timestamp);
    let processed = 0;
    for (const point of ordered) {
      if (state.value !== 'recording') break;
      onPoint(point);
      if (state.value !== 'recording') break;
      processed = point.timestamp;
    }
    if (persist() && processed && !acknowledgeBackgroundPoints(recordOwner, processed)) {
      pause();uni.showToast({title:"轨迹已保存，后台缓存清理失败，记录已暂停",icon:"none"});
    }
  } finally { flushingBackground = false; }
}
async function begin() {
  if (starting || state.value === "recording") return;
  starting = true;
  const epoch = ++generation;
  let ok=false;
  try{ok=await startLocationUpdates(onPoint);}catch{uni.showToast({title:'定位启动失败，请重试',icon:'none'});}finally{starting=false;}
  if (disposed || epoch !== generation) { stopLocationUpdates(onPoint); return; }
  if (!ok) {
    uni.showToast({ title: "请启用隐私设置中的定位并授权", icon: "none" });
    return;
  }
  if (!startedAt) { startedAt = Date.now(); recordOwner = currentTrackOwner() || 'anonymous'; }
  resumedAt = Date.now();
  segmentStart = true;
  state.value = "recording";
  if (timer) clearInterval(timer);
  let ticks = 0;
  timer = setInterval(() => { updateElapsed(); if (++ticks % 5 === 0) persist(); }, 1000);
  if(!persist())return;
  if (backgroundSupported() && hasPrivacyConsent('backgroundLocation')) {
    let startingNative = true;
    let failureMessage = '';
    const native = beginBackground(recordOwner, `t-${startedAt}`, flushBackground, message => {
      failureMessage = message;
      if (!startingNative) { backgroundOn.value = false; pause(); uni.showToast({ title: message, icon: 'none' }); }
    });
    startingNative = false;
    backgroundOn.value = native;
    if (native) stopLocationUpdates(onPoint);
    else uni.showToast({ title: failureMessage || '后台未启动，目前仅在前台记录', icon: 'none' });
  }
}
async function start() { await begin(); }
async function resume() { await begin(); }
function pause(store = true) {
  stopBackgroundRecording(); backgroundOn.value = false;
  if (store && !flushingBackground) flushBackground();
  generation++;
  activeMs = duration();
  resumedAt = 0;
  state.value = "paused";
  stopLocationUpdates(onPoint);
  if (timer) clearInterval(timer);
  timer = null;
  speedText.value = "0.0";
  updateElapsed();
  if (store) persist();
}
function finish() {
  if (starting || state.value === 'idle') return;
  pause();
  if (points.value.length < 2) {
    const session = startedAt;
    const epoch = generation;
    uni.showModal({ title: "轨迹点不足", content: "至少需要两个点。继续记录，或放弃本次记录。", confirmText: "继续记录", cancelText: "放弃", success: (r) => {
      if (r.confirm || disposed || generation !== epoch || startedAt !== session || state.value !== 'paused') return;
      try { reset(); } catch { uni.showToast({ title: '草稿删除失败，记录已保留', icon: 'none' }); }
    } });
    return;
  }
  try {
    saveTrack({ ...record("finished"), endedAt: Date.now() });
  } catch {
    tracksValid.value=trackStorageValid();
    uni.showToast({ title: "轨迹保存失败，当前记录仍保留", icon: "none" });
    return;
  }
  refreshTrackList();
  try {
    reset();
    uni.showToast({ title: "轨迹已保存", icon: "success" });
  } catch {
    uni.showToast({ title: '轨迹已保存，草稿清理失败', icon: 'none' });
  }
}
function reset() {
  clearDraft();
  state.value = "idle";
  points.value = [];
  distanceM.value = ascentM.value = descentM.value = 0;
  startedAt = activeMs = resumedAt = 0;
  recordOwner = '';
  elapsedText.value = "0:00";
  speedText.value = "0.0";
  lastAlt = null;
}

function hideDraftForOtherAccount(){
  generation++;stopBackgroundRecording();backgroundOn.value=false;stopLocationUpdates(onPoint);
  if(timer)clearInterval(timer);timer=null;state.value='idle';points.value=[];
  distanceM.value=ascentM.value=descentM.value=0;startedAt=activeMs=resumedAt=0;recordOwner='';elapsedText.value='0:00';speedText.value='0.0';lastAlt=null;
}

function openImport() { uni.navigateTo({ url: "/pages/track/import" }); }

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/track/detail?id=${id}` });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const unsubscribeAccount = onAccountChange(() => {
  const savedOwner=recordOwner;
  if(state.value==='recording')pause();
  if(savedOwner&&savedOwner!==currentLocalTrackOwner())hideDraftForOtherAccount();
  refreshTrackList();
});
onUnmounted(() => {
  disposed = true;
  generation++;
  unsubscribePrivacy(); unsubscribeAccount();
  if (state.value !== "idle") pause();
  if (timer) clearInterval(timer);
});
</script>

<style lang="scss" scoped>
.page { display: flex; flex-direction: column; height: 100vh; background: #0f141b; }
.panel { padding: 40rpx 32rpx 24rpx; }
.stats { display: flex; background: #151d27; border-radius: 20rpx; padding: 28rpx 0; }
.stat { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.stat-v { font-size: 34rpx; font-weight: 700; color: #eef4ea; }
.stat-k { font-size: 20rpx; color: #5c6a78; }
.controls { display: flex; gap: 24rpx; margin-top: 24rpx; }
.btn { flex: 1; border-radius: 999rpx; font-size: 30rpx; font-weight: 600; }
.btn.start { background: #b8f36b; color: #0f141b; }
.btn.pause { background: #ffd166; color: #0f141b; }
.btn.stop { background: #ff7b72; color: #0f141b; }
.hint { display: block; margin-top: 16rpx; font-size: 22rpx; color: #5c6a78; text-align: center; }
.list { flex: 1; padding: 0 32rpx; box-sizing: border-box; }
.group-title { font-size: 24rpx; color: #5c6a78; margin: 16rpx 0; }
.card { display: flex; align-items: center; background: #151d27; border-radius: 20rpx; padding: 28rpx 24rpx; margin-bottom: 16rpx; }
.card-l { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.card-name { font-size: 30rpx; font-weight: 600; color: #eef4ea; }
.card-meta { font-size: 22rpx; color: #8a97a5; }
.synced { font-size: 20rpx; color: #b8f36b; }
.empty { color: #5c6a78; font-size: 24rpx; text-align: center; padding: 48rpx 0; }
.privacy-note { display:block; margin:16rpx 32rpx; padding:20rpx; border-radius:16rpx; background:#202b37; color:#ffd166; font-size:22rpx; line-height:1.6; }
</style>
