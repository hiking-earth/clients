<template>
  <view class="page" v-if="track">
    <view class="head">
      <text class="name">{{ track.name }}</text>
      <text class="date">{{ formatFull(track.startedAt) }}</text>
    </view>

    <view class="grid">
      <view class="cell"><text class="v">{{ (track.distanceM / 1000).toFixed(2) }} km</text><text class="k">里程</text></view>
      <view class="cell"><text class="v">{{ track.ascentM.toFixed(0) }} m</text><text class="k">爬升</text></view>
      <view class="cell"><text class="v">{{ durationText }}</text><text class="k">用时</text></view>
      <view class="cell"><text class="v">{{ track.points.length }}</text><text class="k">轨迹点</text></view>
    </view>

    <TrackCanvas :layers="offlineLayer?.paths || []" :attribution="offlineLayer?.attribution || ''" :points="track.points" />

    <view class="actions">
      <button class="btn primary" @click="navAlong">沿此轨迹导航</button>
      <button class="btn" @click="exportGpx">导出 GPX</button>
      <button v-if="!track.synced" class="btn" @click="sync">云同步</button>
      <button class="btn danger" @click="remove">删除</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { saveNativeGpx } from '@/services/files';
import { activeOfflineLayer } from '@/services/offline';
const offlineLayer = activeOfflineLayer();
import TrackCanvas from '@/components/TrackCanvas.vue';
import { isDesktop, saveDesktopGpx } from '@/services/desktop';
import { toMapPoint } from "@shared/api/coordinates";
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { trackToGpx, type TrackRecord } from "@shared/types/track";
import { deleteTrack, getTrack, markSynced } from "@/services/tracks";
import { callCloud } from "@/services/cloud";
import { hasPrivacyConsent } from "@/services/privacy";

declare const plus: any;
declare const wx: any;
const track = ref<TrackRecord | null>(null);

onLoad((q) => {
  const t = getTrack(q?.id as string);
  if (!t) {
    uni.showToast({ title: "轨迹不存在", icon: "none" });
    setTimeout(() => uni.navigateBack(), 1000);
    return;
  }
  track.value = t;
  uni.setNavigationBarTitle({ title: t.name });
});

const center = computed(() => {
  const pts = track.value!.points;
  const mid = pts[Math.floor(pts.length / 2)];
  return toMapPoint(mid);
});

const polyline = computed(() => {
  const segments: { latitude: number; longitude: number }[][] = [];
  for (const p of track.value!.points) {
    if (!segments.length || p.segmentStart) segments.push([]);
    segments[segments.length - 1].push(toMapPoint(p));
  }
  return segments.filter(s => s.length >= 2).map(points => ({ points, color: "#b8f36b", width: 4, arrowLine: true }));
});

const markers = computed(() => {
  const pts = track.value!.points;
  const first = toMapPoint(pts[0]);
  const last = toMapPoint(pts[pts.length - 1]);
  return [
    { id: 1, latitude: first.latitude, longitude: first.longitude, title: "起点", width: 24, height: 24 },
    { id: 2, latitude: last.latitude, longitude: last.longitude, title: "终点", width: 24, height: 24 },
  ];
});

const durationText = computed(() => {
  const t = track.value!;
  if (!t.endedAt || t.points.every(p => p.timeEstimated)) return "-";
  const s = Math.floor((t.activeDurationMs ?? (t.endedAt - t.startedAt)) / 1000);
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
});

function navAlong() {
  if (track.value!.points.slice(1).some(p => p.segmentStart)) { uni.showModal({ title: "轨迹包含中断", content: "分段之间没有路径记录，暂不提供跨段导航。请导入连续轨迹。", showCancel: false }); return; }
  uni.navigateTo({ url: `/pages/navigation/session?trackId=${track.value!.id}` });
}

async function exportGpx() {
  const gpx = trackToGpx(track.value!);
  // #ifdef H5
  if (isDesktop()) {
    try { const saved = await saveDesktopGpx(track.value!.name, gpx); if (saved) uni.showToast({ title: 'GPX已保存', icon: 'success' }); }
    catch (e) { uni.showToast({ title: String(e), icon: 'none' }); }
    return;
  }
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${track.value!.name}.gpx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  // #endif
  // #ifdef MP-WEIXIN
  const fileName = `track-${Date.now()}.gpx`;
  const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
  wx.getFileSystemManager().writeFile({ filePath, data: gpx, encoding: "utf8", success: () => {
    if (typeof wx.shareFileMessage === "function") wx.shareFileMessage({ filePath, fileName, fail: () => uni.showToast({ title: "文件分享未完成，可重试导出", icon: "none" }) });
    else uni.setClipboardData({ data: gpx });
  }, fail: () => uni.showToast({ title: "GPX 文件保存失败", icon: "none" }) });
  // #endif
  // #ifdef APP-PLUS
  try { const saved = await saveNativeGpx(track.value!.name, gpx); if (saved) uni.showToast({ title: 'GPX已保存', icon: 'success' }); }
  catch (e) { uni.showToast({ title: e instanceof Error ? e.message : 'GPX保存失败', icon: 'none' }); }
  // #endif
}

async function sync() {
  if (!hasPrivacyConsent("trackCloudSync")) {
    uni.showModal({
      title: "需要轨迹备份授权",
      content: "请先在“我的 → 隐私设置”中启用云端轨迹备份。",
      showCancel: false,
    });
    return;
  }
  uni.showLoading({ title: "同步中" });
  const res = await callCloud("track-sync", { track: track.value });
  uni.hideLoading();
  if (res.ok) {
    markSynced(track.value!.id);
    track.value = getTrack(track.value!.id);
    uni.showToast({ title: "已同步", icon: "success" });
  } else {
    uni.showToast({ title: "同步失败：" + res.errMsg, icon: "none" });
  }
}

function remove() {
  uni.showModal({
    title: "删除该轨迹？",
    content: "删除本机轨迹后不可恢复；已上传的云端副本不会随之删除。",
    success: (r) => {
      if (r.confirm) {
        deleteTrack(track.value!.id);
        uni.navigateBack();
      }
    },
  });
}

function formatFull(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
</script>

<style lang="scss" scoped>
.page { display: flex; flex-direction: column; height: 100vh; background: #0f141b; }
.head { padding: 32rpx 32rpx 16rpx; }
.name { display: block; font-size: 40rpx; font-weight: 700; color: #eef4ea; }
.date { display: block; margin-top: 8rpx; font-size: 24rpx; color: #5c6a78; }
.grid { display: flex; margin: 16rpx 32rpx; background: #151d27; border-radius: 20rpx; padding: 24rpx 0; }
.cell { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.v { font-size: 28rpx; font-weight: 600; color: #eef4ea; }
.k { font-size: 20rpx; color: #5c6a78; }
.map { width: calc(100% - 64rpx); height: 380rpx; margin: 16rpx 32rpx; border-radius: 20rpx; }
.map-h5-tip { margin: 16rpx 32rpx; height: 380rpx; display: flex; align-items: center; justify-content: center; background: #151d27; border-radius: 20rpx; color: #5c6a78; font-size: 24rpx; text-align: center; padding: 0 48rpx; }
.actions { margin-top: auto; padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 16rpx; }
.btn { border-radius: 999rpx; font-size: 28rpx; background: #1a2430; color: #eef4ea; }
.btn.primary { background: #b8f36b; color: #0f141b; font-weight: 600; }
.btn.danger { color: #ff7b72; }
</style>
