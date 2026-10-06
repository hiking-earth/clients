<template>
  <view class="page">
    <!-- 自定义导航头 -->
    <view class="hero">
      <text class="hero-title">徒步地球</text>
      <text class="hero-sub">以 3D 地球发现全球徒步路线 · 客户端</text>
      <text class="hero-sub">{{ ROUTES.length }} 条路线档案 · 新收录路线开放状态待核验</text>
      <text class="hero-sub">路线数据 © OpenStreetMap contributors · ODbL</text>
      <text v-for="source in catalogSources" :key="source.id" class="hero-sub">{{ source.label }}：{{ catalogCacheState[source.id].message }}</text>
      <button size="mini" @click="refreshRouteCatalog(true)">刷新路线目录</button>
      <view class="search-box">
        <input v-model="keyword" class="search-input" placeholder="搜索路线 / 地区 / 景观" placeholder-class="ph" confirm-type="search" />
      </view>
    </view>
    <view class="online-search">
      <text>本机搜索仅覆盖已同步目录；在线检索覆盖当前来源快照。</text>
      <picker :range="catalogSourceLabels" :value="searchSourceIndex" @change="changeSearchSource"><view>来源：{{ catalogSources[searchSourceIndex].label }}</view></picker>
      <button size="mini" :disabled="searchLoading" @click="onlineSearch(false)">{{ searchLoading?'检索中…':'在线检索全部来源记录' }}</button>
      <button v-if="onlineMode" size="mini" @click="leaveOnlineSearch">返回本机目录</button>
      <text v-if="searchMessage">{{ searchMessage }}</text>
    </view>

    <!-- 筛选 -->
    <scroll-view scroll-x class="chips" :show-scrollbar="false">
      <view class="chips-inner">
        <view
          v-for="c in statusChips" :key="c"
          class="chip" :class="{ on: statusFilter === c }"
          @click="statusFilter = statusFilter === c ? '' : c"
        >{{ c || '全部状态' }}</view>
      </view>
    </scroll-view>
    <scroll-view scroll-x class="chips" :show-scrollbar="false">
      <view class="chips-inner">
        <view
          v-for="c in seasonChips" :key="c"
          class="chip" :class="{ on: seasonFilter === c }"
          @click="seasonFilter = seasonFilter === c ? '' : c"
        >{{ c || '全部季节' }}</view>
      </view>
    </scroll-view>

    <!-- 路线卡片 -->
    <scroll-view scroll-y class="list">
      <view
        v-for="r in filtered.slice(0, visibleCount)" :key="r.id"
        class="card"
        @click="goDetail(r)"
      >
        <view class="card-head">
          <view class="dot" :style="{ background: STATUS_COLORS[r.status] }"></view>
          <text class="card-status">{{ r.status }}</text>
          <text class="card-region">{{ r.region }}</text>
        </view>
        <text class="card-name">{{ r.name }}</text>
        <text class="card-summary">{{ r.summary }}</text>
        <view class="card-meta">
          <text>{{ r.distance }}</text>
          <text>爬升 {{ r.ascent }}</text>
          <text>{{ r.duration }}</text>
          <text>{{ r.difficulty }}</text>
        </view>
        <view class="card-tags">
          <text v-for="s in r.scenery" :key="s" class="tag">{{ s }}</text>
          <text v-if="isNavigable(r)" class="tag nav">可导航</text>
        </view>
      </view>
      <button v-if="onlineMode && searchHasMore" :disabled="searchLoading" @click="onlineSearch(true)">继续读取在线结果</button>
      <button v-if="filtered.length > visibleCount" @click="visibleCount += 50">加载更多（共 {{ filtered.length }} 条）</button>
      <view v-if="filtered.length === 0" class="empty">没有匹配的路线</view>
      <view class="disclaimer">候选版本，不构成导航服务或许可；出行以属地公告为准</view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ROUTES, catalogCacheState, refreshRouteCatalog, rememberDiscoveredRoute } from "@/services/route-catalog";
import {searchPublicCatalog} from "@/services/catalog-search";
import type {HikingRoute} from "@shared/types/route";
import { STATUS_COLORS, isNavigable, type RouteStatus, type Season } from "@shared/types/route";

const catalogSources=[{id:'osm',label:'OSM'},{id:'usfs',label:'美国国家森林'},{id:'hk',label:'香港官方步道'}] as const;
const catalogSourceLabels=catalogSources.map(source=>source.label);
const keyword = ref("");
const searchSourceIndex=ref(0),onlineMode=ref(false),searchLoading=ref(false),searchHasMore=ref(false),searchMessage=ref(''),onlineRoutes=ref<HikingRoute[]>([]);
let searchGeneration=0,searchSnapshot='',searchOffset=0;
function leaveOnlineSearch(){searchGeneration++;onlineMode.value=false;searchLoading.value=false;searchHasMore.value=false;onlineRoutes.value=[];searchMessage.value='';}
function changeSearchSource(event:any){searchSourceIndex.value=Number(event.detail.value)||0;leaveOnlineSearch();}
async function onlineSearch(more:boolean){
 if(searchLoading.value)return;const query=keyword.value.trim();if(query.length<2){searchMessage.value='在线检索至少输入2个字符';return;}
 const generation=++searchGeneration;searchLoading.value=true;
 try{const result=await searchPublicCatalog(catalogSources[searchSourceIndex.value].id,query,more?searchOffset:0,more?searchSnapshot:undefined);if(generation!==searchGeneration)return;
  onlineMode.value=true;onlineRoutes.value=more?[...onlineRoutes.value,...result.routes]:result.routes;searchSnapshot=result.snapshot;searchOffset=result.offset+result.routes.length;searchHasMore.value=result.hasMore;searchMessage.value=`来源匹配${result.total}条，已读取${onlineRoutes.value.length}条；收录不代表开放或可导航。`;
 }catch(error){if(generation===searchGeneration)searchMessage.value=error instanceof Error?error.message:'在线检索失败，保留现有结果';}
 finally{if(generation===searchGeneration)searchLoading.value=false;}
}
watch(keyword,()=>{if(onlineMode.value||searchLoading.value)leaveOnlineSearch();});
const visibleCount = ref(50);
const statusFilter = ref<RouteStatus | "">("");
const seasonFilter = ref<Season | "">("");

watch([keyword, statusFilter, seasonFilter], () => { visibleCount.value = 50; });
const statusChips: (RouteStatus | "")[] = ["", "开放中", "待核验", "即将开放", "临时关闭"];
const seasonChips: (Season | "")[] = ["", "春", "夏", "秋", "冬"];

const filtered = computed(() => {
  const kw = keyword.value.trim();
  return (onlineMode.value?onlineRoutes.value:ROUTES).filter((r) => {
    if (statusFilter.value && r.status !== statusFilter.value) return false;
    if (seasonFilter.value && !r.bestSeasons.includes(seasonFilter.value)) return false;
    if (kw && !onlineMode.value) {
      const hay = `${r.name} ${r.region} ${r.scenery.join(" ")} ${r.summary}`;
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
});

function goDetail(route: HikingRoute) {
  rememberDiscoveredRoute(route);const id=route.id;
  uni.navigateTo({ url: `/pages/route/detail?id=${encodeURIComponent(id)}` });
}
</script>

<style lang="scss" scoped>
.page { display: flex; flex-direction: column; height: 100vh; background: #0f141b; }
.hero { padding: 88rpx 32rpx 16rpx; }
.hero-title { display: block; font-size: 56rpx; font-weight: 700; color: #eef4ea; }
.hero-sub { display: block; margin-top: 8rpx; font-size: 24rpx; color: #8a97a5; }
.online-search { display:flex;flex-direction:column;gap:12rpx;padding:12rpx 32rpx;font-size:24rpx;color:#8a97a5; }
.search-box { margin-top: 24rpx; background: #1a2430; border-radius: 16rpx; padding: 8rpx 24rpx; }
.search-input { height: 64rpx; font-size: 28rpx; color: #eef4ea; }
.ph { color: #5c6a78; }
.chips { white-space: nowrap; padding: 8rpx 0; }
.chips-inner { display: inline-flex; gap: 16rpx; padding: 0 32rpx; }
.chip { padding: 10rpx 24rpx; font-size: 24rpx; color: #8a97a5; background: #1a2430; border-radius: 999rpx; }
.chip.on { color: #0f141b; background: #b8f36b; font-weight: 600; }
.list { flex: 1; padding: 8rpx 32rpx 0; box-sizing: border-box; }
.card { background: #151d27; border-radius: 20rpx; padding: 24rpx; margin-bottom: 24rpx; }
.card-head { display: flex; align-items: center; gap: 12rpx; }
.dot { width: 16rpx; height: 16rpx; border-radius: 50%; }
.card-status { font-size: 22rpx; color: #aeb9c4; }
.card-region { margin-left: auto; font-size: 22rpx; color: #5c6a78; }
.card-name { display: block; margin-top: 12rpx; font-size: 32rpx; font-weight: 600; color: #eef4ea; }
.card-summary { display: block; margin-top: 8rpx; font-size: 24rpx; color: #8a97a5; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.card-meta { display: flex; flex-wrap: wrap; gap: 24rpx; margin-top: 16rpx; font-size: 22rpx; color: #aeb9c4; }
.card-tags { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx; }
.tag { font-size: 20rpx; color: #8a97a5; background: #1a2430; padding: 6rpx 16rpx; border-radius: 8rpx; }
.tag.nav { color: #b8f36b; }
.empty { text-align: center; color: #5c6a78; padding: 80rpx 0; font-size: 26rpx; }
.disclaimer { text-align: center; color: #445059; font-size: 20rpx; padding: 24rpx 0 48rpx; }
</style>
