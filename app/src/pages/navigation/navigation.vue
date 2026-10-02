<template>
  <view class="page">
    <view class="intro">
      <text class="intro-title">沿轨迹导航</text>
      <text class="intro-sub">精准箭头实时指向 · 偏航震动提醒 · 无需看地图</text>
    </view>

    <scroll-view scroll-y class="list">
      <view class="team-entry" @click="goTeam">
        <view class="team-l">
          <text class="team-t">👥 组队会合</text>
          <text class="team-s">队友实时位置互见 · 箭头导航会合</text>
        </view>
        <text class="go">→</text>
      </view>

      <view class="group-title">可导航路线（{{ navigableRoutes.length }}）</view>
      <view v-for="r in navigableRoutes" :key="r.id" class="card" @click="start(r.id)">
        <view class="card-l">
          <text class="card-name">{{ r.name }}</text>
          <text class="card-meta">{{ r.region }} · {{ r.distance }} · {{ r.difficulty }}</text>
        </view>
        <text class="go">→</text>
      </view>

      <view class="group-title">从我的轨迹导航</view>
      <view v-if="tracks.length === 0" class="empty">还没有已完成的轨迹，去「轨迹」页记录一条</view>
      <view v-for="t in tracks" :key="t.id" class="card" @click="startTrack(t.id)">
        <view class="card-l">
          <text class="card-name">{{ t.name }}</text>
          <text class="card-meta">{{ (t.distanceM / 1000).toFixed(1) }} km · {{ t.points.length }} 个点</text>
        </view>
        <text class="go">→</text>
      </view>

      <view class="notice">
        提示：候选版路线轨迹多为「认知示意」级，导航仅作方向参考；高风险或未核验路线请以属地公告和实地路况为准。
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { ROUTES } from "@shared/data/routes.seed";
import { isNavigable } from "@shared/types/route";
import { listTracks } from "@/services/tracks";
import type { TrackRecord } from "@shared/types/track";

const tracks = ref<TrackRecord[]>([]);

onShow(() => {
  tracks.value = listTracks().filter((t) => t.state === "finished" && t.points.length >= 2);
});

const navigableRoutes = computed(() => ROUTES.filter(isNavigable));

function start(routeId: string) {
  uni.navigateTo({ url: `/pages/navigation/session?routeId=${routeId}` });
}
function startTrack(trackId: string) {
  uni.navigateTo({ url: `/pages/navigation/session?trackId=${trackId}` });
}
function goTeam() {
  uni.navigateTo({ url: "/pages/team/team" });
}
</script>

<style lang="scss" scoped>
.page { display: flex; flex-direction: column; height: 100vh; background: #0f141b; }
.intro { padding: 40rpx 32rpx 24rpx; }
.intro-title { display: block; font-size: 44rpx; font-weight: 700; color: #eef4ea; }
.intro-sub { display: block; margin-top: 8rpx; font-size: 24rpx; color: #8a97a5; }
.list { flex: 1; padding: 0 32rpx; box-sizing: border-box; }
.group-title { font-size: 24rpx; color: #5c6a78; margin: 24rpx 0 16rpx; }
.card { display: flex; align-items: center; background: #151d27; border-radius: 20rpx; padding: 28rpx 24rpx; margin-bottom: 16rpx; }
.card-l { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.card-name { font-size: 30rpx; font-weight: 600; color: #eef4ea; }
.card-meta { font-size: 22rpx; color: #8a97a5; }
.go { font-size: 36rpx; color: #b8f36b; }
.team-entry { display: flex; align-items: center; background: rgba(184, 243, 107, 0.1); border: 1rpx solid rgba(184, 243, 107, 0.3); border-radius: 20rpx; padding: 28rpx 24rpx; margin: 16rpx 0 8rpx; }
.team-l { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.team-t { font-size: 30rpx; font-weight: 600; color: #eef4ea; }
.team-s { font-size: 22rpx; color: #8a97a5; }
.empty { color: #5c6a78; font-size: 24rpx; padding: 24rpx 0; }
.notice { margin: 32rpx 0 48rpx; padding: 24rpx; background: #1a2430; border-radius: 16rpx; font-size: 22rpx; color: #8a97a5; line-height: 1.7; }
</style>
