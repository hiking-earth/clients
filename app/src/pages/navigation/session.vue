<template>
  <view class="page">
    <!-- 顶栏 -->
    <view class="topbar">
      <view class="quit" @click="quit">‹ 退出</view>
      <text class="title">{{ navTitle }}</text>
      <view class="mode" @click="mode = mode === 'arrow' ? 'map' : 'arrow'">
        {{ mode === 'arrow' ? '地图' : '箭头' }}
      </view>
    </view>

    <!-- 箭头模式 -->
    <view v-if="mode === 'arrow'" class="arrow-wrap">
      <!-- 罗盘环 -->
      <view class="ring">
        <view
          v-for="(mark, i) in compassMarks" :key="i"
          class="mark"
          :style="{ transform: `rotate(${mark.deg - heading}deg) translateY(-260rpx)` }"
        >
          <text class="mark-text" :class="{ cardinal: mark.cardinal }">{{ mark.label }}</text>
        </view>
        <!-- 目标箭头：类苹果查找 -->
        <view v-if="hasFix && (!memberMode || memberPos)" class="arrow" :style="{ transform: `rotate(${arrowAngle}deg)` }">
          <view class="arrow-body"></view>
          <view class="arrow-head"></view>
        </view>
        <!-- 中心信息 -->
        <view v-if="hasFix && (!memberMode || memberPos)" class="center">
          <text class="dist">{{ formatDistance(targetDistance) }}</text>
          <text class="bearing">{{ Math.round(targetBearing) }}°</text>
          <text class="wp">{{ memberMode ? `与 ${memberName} 相向而行` : `路径点 ${waypointIndex + 1}/${path.length}` }}</text>
        </view>
      </view>

      <view v-if="offRoute && !memberMode" class="offroute">⚠ 已偏离轨迹 {{ Math.round(offRouteDist) }} m，请回到路线</view>
      <view v-if="finished" class="finished-banner">{{ memberMode ? '🎉 已会合' : '🎉 已到达终点' }}</view>
      <view v-if="!hasFix" class="nofix">正在获取定位…请先在“我的 → 隐私设置”启用导航定位，并按系统提示授权</view>
      <view v-else-if="memberMode && !memberPos" class="nofix">等待队友位置上报…</view>
    </view>

    <!-- 地图模式 -->
    <view v-else class="map-wrap">
      <!-- #ifndef H5 -->
      <map
        v-if="mapCenter"
        class="map"
        :latitude="mapCenter.latitude"
        :longitude="mapCenter.longitude"
        :scale="mapScale"
        :markers="mapMarkers"
        :polyline="mapPolyline"
        show-location
      ></map>
      <!-- #endif -->
      <!-- #ifdef H5 -->
      <view class="map-h5-tip">H5 预览未配置地图 key，真机/小程序内显示腾讯地图</view>
      <!-- #endif -->
      <view class="map-hud">
        <text>距下一路径点 {{ formatDistance(targetDistance) }}</text>
        <text v-if="offRoute" class="hud-warn">偏航 {{ Math.round(offRouteDist) }} m</text>
      </view>
    </view>

    <!-- 底部数据条 -->
    <view class="hud">
      <view class="hud-cell"><text class="hud-v">{{ formatDistance(remainM) }}</text><text class="hud-k">剩余</text></view>
      <view class="hud-cell"><text class="hud-v">{{ formatDistance(walkedM) }}</text><text class="hud-k">已走</text></view>
      <view class="hud-cell"><text class="hud-v">{{ elapsedText }}</text><text class="hud-k">用时</text></view>
      <view class="hud-cell sos" @click="triggerSos"><text class="hud-v sos-v">SOS</text><text class="hud-k">一键求救</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { toMapPoint } from "@shared/api/coordinates";
import { isNavigable } from "@shared/types/route";
import { computed, onUnmounted, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { ROUTES } from "@shared/data/routes.seed";
import type { LatLng } from "@shared/api/navigation-core";
import {
  arrowDeg, bearingDeg, formatDistance, haversineM, nextWaypoint, offRouteDistanceM,
} from "@shared/api/navigation-core";
import { MAP } from "@shared/constants";
import { startCompass, stopCompass, startLocationUpdates, stopLocationUpdates } from "@/services/location";
import { getTrack } from "@/services/tracks";
import { callCloud } from "@/services/cloud";
import { onPrivacyChange } from "@/services/privacy";
import type { TrackPoint } from "@shared/types/track";

/* ---------- 数据源：路线 / 我的轨迹 / 会合队友 ---------- */
const navTitle = ref("导航");
const path = ref<LatLng[]>([]);
const reverse = ref(false);
const memberMode = ref(false);
const memberId = ref("");
const memberName = ref("");
const memberPos = ref<LatLng | null>(null);
const teamId = ref("");
let memberTimer: ReturnType<typeof setInterval> | null = null;

onLoad((q) => {
  if (q?.mode === "member") {
    // 会合模式：目标是队友实时位置（动态点）
    memberMode.value = true;
    teamId.value = (q.teamId as string) ?? "";
    memberId.value = (q.memberId as string) ?? "";
    memberName.value = decodeURIComponent((q.name as string) ?? "队友");
    navTitle.value = `会合 · ${memberName.value}`;
    boot();
    pollMember();
    memberTimer = setInterval(pollMember, 10000);
    return;
  }
  if (q?.routeId) {
    const r = ROUTES.find((x) => x.id === q.routeId);
    if (r && isNavigable(r)) {
      navTitle.value = r.name;
      path.value = r.path.map(([longitude, latitude]) => ({ latitude, longitude }));
    }
  } else if (q?.trackId) {
    const t = getTrack(q.trackId);
    if (t && !t.points.slice(1).some(p => p.segmentStart)) {
      navTitle.value = t.name;
      path.value = t.points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    }
  }
  if (q?.reverse === "1") {
    path.value = [...path.value].reverse();
    reverse.value = true;
  }
  if (path.value.length < 2) {
    uni.showToast({ title: "导航数据不可用", icon: "none" });
    setTimeout(() => uni.navigateBack(), 1200);
    return;
  }
  boot();
});

async function pollMember() {
  const res = await callCloud<{ members: { openid: string; latitude: number; longitude: number; updatedAt: number }[] }>(
    "team-locations", { teamId: teamId.value },
  );
  const m = res.data?.members?.find((x) => x.openid === memberId.value);
  memberPos.value = m && Number.isFinite(m.latitude) && Number.isFinite(m.longitude) && m.updatedAt > 0 && Date.now() - m.updatedAt <= 60000 ? { latitude: m.latitude, longitude: m.longitude } : null;
  if (!memberPos.value) finished.value = false;
  // 会合模式下如果已有双方位置，立即刷新指向
  if (memberPos.value && position.value) updateMemberNav(position.value);
}

/* ---------- 导航状态 ---------- */
const mode = ref<"arrow" | "map">("arrow");
const heading = ref(0);
const position = ref<TrackPoint | null>(null);
const hasFix = computed(() => position.value !== null);
const unsubscribePrivacy = onPrivacyChange(c => { if (!c.location) { position.value = null; finished.value = false; } });
const targetBearing = ref(0);
const targetDistance = ref(0);
const waypointIndex = ref(0);
const finished = ref(false);
const offRoute = ref(false);
const offRouteDist = ref(0);
const walkedM = ref(0);
const startedAt = ref(Date.now());
const elapsedText = ref("0:00");
let lastPoint: TrackPoint | null = null;
let offRouteNotifiedAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const arrowAngle = computed(() => arrowDeg(targetBearing.value, heading.value));

const remainM = computed(() => {
  if (!position.value || path.value.length === 0) return 0;
  let remain = targetDistance.value;
  for (let i = waypointIndex.value; i < path.value.length - 1; i++) {
    remain += haversineM(path.value[i], path.value[i + 1]);
  }
  return remain;
});

/* 罗盘刻度 */
const compassMarks = [
  { label: "北", deg: 0, cardinal: true },
  { label: "东", deg: 90, cardinal: true },
  { label: "南", deg: 180, cardinal: true },
  { label: "西", deg: 270, cardinal: true },
  ...[30, 60, 120, 150, 210, 240, 300, 330].map((deg) => ({ label: "·", deg, cardinal: false })),
];

const onHeading = (deg: number) => { heading.value = deg; };
let disposed = false;
async function boot() {
  if (!(await startLocationUpdates(onLocation)) || disposed) {
    stopLocationUpdates(onLocation);
    if (!disposed) uni.showToast({ title: "请启用隐私设置中的定位并授权", icon: "none" });
    return;
  }
  uni.setKeepScreenOn?.({ keepScreenOn: true });
  startCompass(onHeading);
  timer = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt.value) / 1000);
    elapsedText.value = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 1000);
}

function onLocation(p: TrackPoint) {
  if (lastPoint) {
    const d = haversineM(lastPoint, p);
    if (d < 50) walkedM.value += d; // 跳点过滤
  }
  lastPoint = p;
  position.value = p;

  if (memberMode.value) {
    updateMemberNav(p);
    return;
  }

  const me: LatLng = { latitude: p.latitude, longitude: p.longitude };
  const wp = nextWaypoint(me, path.value, MAP.arriveThresholdM);
  waypointIndex.value = wp.index;
  targetDistance.value = wp.distanceM;
  targetBearing.value = bearingDeg(me, wp.point);

  if (wp.arrived && !wp.finished) {
    uni.vibrateShort?.({ complete: () => {} });
  }
  if (wp.finished && !finished.value) {
    finished.value = true;
    uni.vibrateLong?.({ complete: () => {} });
  }

  const off = offRouteDistanceM(me, path.value);
  offRouteDist.value = off;
  const nowOff = off > MAP.offRouteThresholdM;
  if (nowOff && !offRoute.value && Date.now() - offRouteNotifiedAt > 15000) {
    offRouteNotifiedAt = Date.now();
    uni.vibrateLong?.({ complete: () => {} });
    uni.showToast({ title: "已偏离轨迹", icon: "none" });
  }
  offRoute.value = nowOff;
}

/** 会合模式：箭头指向队友实时位置，双向距离随两人移动更新 */
function updateMemberNav(p: TrackPoint) {
  if (!memberPos.value) return;
  const me: LatLng = { latitude: p.latitude, longitude: p.longitude };
  targetDistance.value = haversineM(me, memberPos.value);
  targetBearing.value = bearingDeg(me, memberPos.value);
  if (targetDistance.value <= MAP.arriveThresholdM && !finished.value) {
    finished.value = true;
    uni.vibrateLong?.({ complete: () => {} });
    uni.showToast({ title: `已与 ${memberName.value} 会合`, icon: "none" });
  }
}

/* ---------- 地图模式数据 ---------- */
const mapCenter = computed(() => { const p = position.value ?? path.value[0]; return p ? toMapPoint(p) : null; });
const mapScale = computed(() => {
  if (targetDistance.value < 200) return 17;
  if (targetDistance.value < 1000) return 15;
  return 13;
});
const mapMarkers = computed(() => {
  if (path.value.length === 0) return [];
  const end = toMapPoint(path.value[path.value.length - 1]);
  const first = toMapPoint(path.value[0]);
  return [
    { id: 1, latitude: first.latitude, longitude: first.longitude, title: "起点", width: 24, height: 24 },
    { id: 2, latitude: end.latitude, longitude: end.longitude, title: "终点", width: 24, height: 24 },
  ];
});
const mapPolyline = computed(() => [
  {
    points: path.value.map(toMapPoint),
    color: "#b8f36b", width: 4, arrowLine: true,
  },
]);

/* ---------- SOS ---------- */
async function triggerSos() {
  const p = position.value;
  if (!p) {
    uni.showToast({ title: "暂无定位，无法上报", icon: "none" });
    return;
  }
  const confirmed = await new Promise<boolean>((resolve) => uni.showModal({
    title: "上传求助位置？",
    content: "将当前位置保存到云端求助记录。目前不会自动通知联系人或救援机构；紧急情况请直接拨打当地求救电话。",
    success: (result) => resolve(result.confirm === true), fail: () => resolve(false),
  }));
  if (!confirmed) return;
  const res = await callCloud("sos-trigger", {
    latitude: p.latitude, longitude: p.longitude, message: `导航「${navTitle.value}」中触发`,
  });
  if (res.ok) {
    uni.showModal({ title: "SOS 已上报", content: "求助记录已保存到云端。尚未接通联系人通知或救援服务，请直接电话求助。", showCancel: false });
  } else {
    uni.showToast({ title: "上报失败：" + res.errMsg, icon: "none" });
  }
}

function quit() {
  uni.showModal({
    title: "结束导航？",
    success: (r) => { if (r.confirm) uni.navigateBack(); },
  });
}

onUnmounted(() => {
  disposed = true;
  unsubscribePrivacy();
  stopCompass(onHeading);
  stopLocationUpdates(onLocation);
  if (timer) clearInterval(timer);
  if (memberTimer) clearInterval(memberTimer);
  uni.setKeepScreenOn?.({ keepScreenOn: false });
});
</script>

<style lang="scss" scoped>
.page { display: flex; flex-direction: column; height: 100vh; background: #0f141b; }
.topbar { display: flex; align-items: center; padding: 88rpx 32rpx 16rpx; }
.quit { font-size: 28rpx; color: #8a97a5; width: 120rpx; }
.title { flex: 1; text-align: center; font-size: 30rpx; font-weight: 600; color: #eef4ea; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mode { width: 120rpx; text-align: right; font-size: 26rpx; color: #b8f36b; }

.arrow-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }
.ring { position: relative; width: 600rpx; height: 600rpx; border-radius: 50%; border: 2rpx solid #1a2430; display: flex; align-items: center; justify-content: center; }
.mark { position: absolute; left: 50%; top: 50%; margin: -20rpx 0 0 -20rpx; width: 40rpx; height: 40rpx; display: flex; align-items: center; justify-content: center; }
.mark-text { font-size: 24rpx; color: #5c6a78; }
.mark-text.cardinal { color: #aeb9c4; font-weight: 600; }
.arrow { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transition: transform 0.15s linear; }
.arrow-body { position: absolute; left: -14rpx; top: -220rpx; width: 28rpx; height: 160rpx; background: #b8f36b; border-radius: 14rpx; }
.arrow-head { position: absolute; left: -44rpx; top: -280rpx; width: 0; height: 0; border-left: 44rpx solid transparent; border-right: 44rpx solid transparent; border-bottom: 72rpx solid #b8f36b; }
.center { display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.dist { font-size: 80rpx; font-weight: 700; color: #eef4ea; }
.bearing { font-size: 30rpx; color: #8a97a5; }
.wp { font-size: 22rpx; color: #5c6a78; }
.offroute { position: absolute; bottom: 40rpx; padding: 16rpx 32rpx; background: rgba(255, 154, 98, 0.15); color: #ff9a62; border-radius: 999rpx; font-size: 26rpx; }
.finished-banner { position: absolute; bottom: 40rpx; padding: 16rpx 32rpx; background: rgba(184, 243, 107, 0.15); color: #b8f36b; border-radius: 999rpx; font-size: 26rpx; }
.nofix { position: absolute; top: 32rpx; font-size: 24rpx; color: #ffd166; }

.map-wrap { flex: 1; position: relative; }
.map { width: 100%; height: 100%; }
.map-h5-tip { display: flex; align-items: center; justify-content: center; height: 100%; color: #5c6a78; font-size: 26rpx; padding: 0 64rpx; text-align: center; }
.map-hud { position: absolute; left: 32rpx; right: 32rpx; bottom: 32rpx; display: flex; justify-content: space-between; background: rgba(15, 20, 27, 0.85); border-radius: 16rpx; padding: 20rpx 24rpx; font-size: 26rpx; color: #eef4ea; }
.hud-warn { color: #ff9a62; }

.hud { display: flex; padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom)); gap: 16rpx; }
.hud-cell { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6rpx; background: #151d27; border-radius: 16rpx; padding: 20rpx 0; }
.hud-v { font-size: 28rpx; font-weight: 600; color: #eef4ea; }
.hud-k { font-size: 20rpx; color: #5c6a78; }
.hud-cell.sos { background: rgba(255, 123, 114, 0.12); }
.sos-v { color: #ff7b72; }
</style>
