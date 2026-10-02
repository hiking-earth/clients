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
        <button v-if="state === 'idle'" class="btn start" @click="start">开始记录</button>
        <template v-else-if="state === 'recording'">
          <button class="btn pause" @click="pause">暂停</button>
          <button class="btn stop" @click="finish">结束</button>
        </template>
        <template v-else-if="state === 'paused'">
          <button class="btn start" @click="resume">继续</button>
          <button class="btn stop" @click="finish">结束</button>
        </template>
      </view>
      <text v-if="state !== 'idle'" class="hint">{{ state === 'recording' ? '记录中…屏幕可锁屏（App 端需后台定位权限）' : '已暂停' }} · {{ points.length }} 个轨迹点</text>
    </view>

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
      <view v-if="tracks.length === 0" class="empty">还没有轨迹，点上方「开始记录」</view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { haversineM } from "@shared/api/navigation-core";
import type { TrackPoint, TrackRecord } from "@shared/types/track";
import { startLocationUpdates, stopLocationUpdates } from "@/services/location";
import { listTracks, saveTrack } from "@/services/tracks";

const state = ref<"idle" | "recording" | "paused">("idle");
const points = ref<TrackPoint[]>([]);
const distanceM = ref(0);
const ascentM = ref(0);
const elapsedText = ref("0:00");
const speedText = ref("0.0");
const tracks = ref<TrackRecord[]>([]);

let startedAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let lastAlt: number | null = null;

onShow(() => { tracks.value = listTracks(); });

function onPoint(p: TrackPoint) {
  const last = points.value[points.value.length - 1];
  if (last) {
    const d = haversineM(last, p);
    if (d < 2) return;         // 静止抖动过滤
    if (d > 100) return;       // 跳点过滤
    distanceM.value += d;
  }
  if (p.altitude != null) {
    if (lastAlt != null && p.altitude > lastAlt) ascentM.value += p.altitude - lastAlt;
    lastAlt = p.altitude;
  }
  speedText.value = ((p.speed ?? 0) * 3.6).toFixed(1);
  points.value.push(p);
}

async function start() {
  const ok = await startLocationUpdates(onPoint);
  if (!ok) {
    uni.showToast({ title: "定位启动失败，请检查权限", icon: "none" });
    return;
  }
  state.value = "recording";
  startedAt = Date.now();
  timer = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    elapsedText.value = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 1000);
}

function pause() {
  state.value = "paused";
  stopLocationUpdates(onPoint);
}

async function resume() {
  await startLocationUpdates(onPoint);
  state.value = "recording";
}

function finish() {
  stopLocationUpdates(onPoint);
  if (timer) clearInterval(timer);
  if (points.value.length >= 2) {
    const now = new Date();
    const rec: TrackRecord = {
      id: `t-${startedAt}`,
      name: `徒步 ${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      points: points.value,
      distanceM: distanceM.value,
      ascentM: ascentM.value,
      descentM: 0,
      startedAt,
      endedAt: Date.now(),
      state: "finished",
      synced: false,
    };
    saveTrack(rec);
    tracks.value = listTracks();
    uni.showToast({ title: "轨迹已保存", icon: "success" });
  } else {
    uni.showToast({ title: "轨迹点太少，未保存", icon: "none" });
  }
  state.value = "idle";
  points.value = [];
  distanceM.value = 0;
  ascentM.value = 0;
  elapsedText.value = "0:00";
  speedText.value = "0.0";
  lastAlt = null;
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/track/detail?id=${id}` });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

onUnmounted(() => {
  if (state.value === "recording") stopLocationUpdates(onPoint);
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
</style>
