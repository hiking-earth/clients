<template>
  <scroll-view scroll-y class="page" v-if="route">
    <image v-if="route.image" class="banner" :src="route.image" mode="aspectFill" />
    <view class="body">
      <view class="head">
        <view class="dot" :style="{ background: STATUS_COLORS[route.status] }"></view>
        <text class="status">{{ route.status }}</text>
        <text class="region">{{ route.region }}</text>
      </view>
<RegionPhoto :region="route.region" />
<text class="name">{{ route.name }}</text>
      <button @click="favorite">{{ favorited ? '取消收藏' : '收藏路线' }}</button>

      <view class="grid">
        <view class="cell"><text class="cell-v">{{ route.distance }}</text><text class="cell-k">里程</text></view>
        <view class="cell"><text class="cell-v">{{ route.ascent }}</text><text class="cell-k">爬升</text></view>
        <view class="cell"><text class="cell-v">{{ route.duration }}</text><text class="cell-k">用时</text></view>
        <view class="cell"><text class="cell-v">{{ route.difficulty }}</text><text class="cell-k">难度</text></view>
      </view>

      <view class="section">
        <text class="sec-title">概况</text>
        <text class="sec-text">{{ route.summary }}</text>
      </view>
      <view class="section">
        <text class="sec-title">亮点</text>
        <view class="hl" v-for="h in route.archive.highlights" :key="h">
          <text class="hl-dot">·</text><text class="sec-text">{{ h }}</text>
        </view>
      </view>
      <view class="section">
        <text class="sec-title">路线区域天气预报</text>
        <text v-if="forecast?.status === 'available' && forecast.weather" class="sec-text">{{ forecast.weather.temperature }} · 风 {{ forecast.weather.wind }} · 湿度 {{ forecast.weather.humidity }} · {{ forecast.weather.rain }}</text>
        <text class="sec-sub">{{ forecast?.status === 'available' ? `预报时刻 ${forecast.weather?.observedAt}` : forecast?.message || '正在获取预报…' }}</text>
        <text class="sec-sub">MET Norway · CC BY 4.0。路线坐标预报不能代替属地预警，也不能证明路线开放。</text>
        <button :disabled="forecastBusy" @click="loadForecast(true)">刷新天气预报</button>
      </view>
      <view class="section warn">
        <text class="sec-title">风险提示</text>
        <text class="sec-text">{{ route.archive.riskNotice }}</text>
      </view>
      <view class="section">
        <text class="sec-title">资料来源</text>
        <text class="sec-text">{{ route.archive.source.label }}</text>
        <text class="sec-sub">{{ route.archive.checkedAt }} · 图片：{{ route.imageCredit }}</text>
      </view>
      <view class="section meta">
        <text class="sec-text">最佳季节 {{ route.bestSeason }} · {{ route.packStyle }} · {{ route.overnight }} · {{ route.surface }}</text>
      </view>
    </view>

    <view class="footer">
      <button v-if="navigable" class="btn primary" @click="startNav">开始导航</button>
      <button v-else class="btn disabled" disabled>该路线不开放导航</button>
    </view>
  <button v-if="route" @click="openSocial">路线留言与日记</button>
    </scroll-view>
</template>

<script setup lang="ts">
function openSocial(){if(route.value)uni.navigateTo({url:`/pages/companion/social?tab=comments&routeId=${encodeURIComponent(route.value.id)}`});}
import RegionPhoto from '@/components/RegionPhoto.vue';
import { readLibrary, toggleFavorite } from '@/services/library';
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { routeForecast, type RouteForecast } from '@/services/weather';
import { ROUTES } from "@/services/route-catalog";
import { STATUS_COLORS, isNavigable, type HikingRoute } from "@shared/types/route";

const route = ref<HikingRoute | null>(null);
const favorited = ref(false);
const forecast=ref<RouteForecast|null>(null),forecastBusy=ref(false);
async function loadForecast(force=false){if(!route.value||forecastBusy.value)return;const selected=route.value;forecastBusy.value=true;try{const value=await routeForecast(selected.center,force);if(route.value?.id===selected.id)forecast.value=value;}finally{forecastBusy.value=false;}}
function favorite() { if (route.value) { try { favorited.value = toggleFavorite(route.value.id); } catch (e) { uni.showToast({ title: String(e), icon: 'none' }); } } }

onLoad((q) => {
  const id = q?.id as string;
  route.value = ROUTES.find((r) => r.id === id) ?? null;
  favorited.value = readLibrary().favorites.includes(id);
  if (route.value) { uni.setNavigationBarTitle({ title: route.value.name }); void loadForecast(); }
});

const navigable = computed(() => (route.value ? isNavigable(route.value) : false));

function startNav() {
  if (!route.value) return;
  uni.navigateTo({ url: `/pages/navigation/session?routeId=${route.value.id}` });
}
</script>

<style lang="scss" scoped>
.page { height: 100vh; background: #01030a; }
.banner { width: 100%; height: 210px; }
.body { padding: 16px; padding-bottom: 80px; }
.head { display: flex; align-items: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.status { font-size: 12px; color: #a7b5aa; }
.region { margin-left: auto; font-size: 12px; color: #a7b5aa; }
.name { display: block; margin-top: 6px; font-size: 22px; font-weight: 700; color: #f4f8f2; }
.grid { display: flex; margin-top: 14px; background: #050c12; border-radius: 10px; padding: 12px 0; }
.cell { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.cell-v { font-size: 13px; font-weight: 600; color: #f4f8f2; }
.cell-k { font-size: 10px; color: #a7b5aa; }
.section { margin-top: 16px; }
.sec-title { display: block; font-size: 14px; font-weight: 600; color: #f4f8f2; margin-bottom: 6px; }
.sec-text { font-size: 13px; color: #a7b5aa; line-height: 1.7; }
.sec-sub { display: block; margin-top: 4px; font-size: 11px; color: #a7b5aa; }
.hl { display: flex; gap: 4px; }
.hl-dot { color: #b8f36b; }
.warn .sec-title { color: #ff9a62; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(transparent, #01030a 30%); }
.btn { border-radius: 499.5px; font-size: 15px; font-weight: 600; }
.btn.primary { background: #b8f36b; color: #01030a; }
.btn.disabled { background: #151f24; color: #a7b5aa; }
</style>
