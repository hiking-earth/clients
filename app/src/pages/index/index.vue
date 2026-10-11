<template>
  <view class="page explore-home">
    <view class="earth-stage"><ExploreGlobe :routes="globeRoutes" :selected-id="selectedRoute" @select="selectGlobeRoute" /></view>
    <view class="explore-panel">
    <!-- 自定义导航头 -->
    <view class="hero">
      <text class="hero-title">徒步地球</text>
      <text class="hero-sub">发现下一段旅程</text>
      <text class="hero-sub">本机已载入 {{ ROUTES.length }} 条路线档案 · 新收录路线开放状态待核验</text>
      <text class="hero-sub">路线数据 © OpenStreetMap contributors · ODbL</text>
      <view v-if="showSources || catalogRefreshing" class="source-status"><text v-for="source in catalogSources" :key="source.id" class="hero-sub">{{ source.label }}：{{ catalogRefreshState[source.id] ? '正在获取目录，已保存资料仍可查看' : catalogCacheState[source.id].message }}</text></view>
      <button size="mini" class="quiet" @click="showSources=!showSources">{{showSources?'收起同步状态':'目录同步状态'}}</button>
      <button size="mini" :disabled="catalogRefreshing" @click="refreshRouteCatalog(true)">{{catalogRefreshing ? '正在刷新目录…' : '刷新路线目录'}}</button>
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
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ExploreGlobe from "@/components/ExploreGlobe.vue";
const selectedRoute=ref('');
import { ROUTES, catalogCacheState, catalogRefreshState, refreshRouteCatalog, rememberDiscoveredRoute } from "@/services/route-catalog";
import {searchPublicCatalog} from "@/services/catalog-search";
import type {HikingRoute} from "@shared/types/route";
import { STATUS_COLORS, isNavigable, type RouteStatus, type Season } from "@shared/types/route";

const catalogSources=[{id:'osm',label:'OSM'},{id:'usfs',label:'美国国家森林'},{id:'hk',label:'香港官方步道'},{id:'nzdoc',label:'新西兰环保部官方步道'}] as const;
const catalogSourceLabels=catalogSources.map(source=>source.label);
const keyword = ref("");
const showSources=ref(false);
const catalogRefreshing=computed(()=>Object.values(catalogRefreshState).some(Boolean));
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

const globeRoutes=computed(()=>{const step=Math.max(1,Math.ceil(filtered.value.length/2000));return filtered.value.filter((route,index)=>index%step===0||route.id===selectedRoute.value);});
function selectGlobeRoute(id:string){selectedRoute.value=id;const route=filtered.value.find(r=>r.id===id);if(route)goDetail(route);}
function goDetail(route: HikingRoute) {
  rememberDiscoveredRoute(route);const id=route.id;
  uni.navigateTo({ url: `/pages/route/detail?id=${encodeURIComponent(id)}` });
}
</script>

<style lang="scss" scoped>
.page { display:flex; flex-direction:column; min-height:100vh; background:var(--he-bg, #01030a); color:var(--he-text, #f4f8f2); }
.earth-stage{padding:12px 12px 0;box-sizing:border-box;}
.explore-panel{display:flex;flex-direction:column;min-height:0;}
@media(min-width:800px){.page{flex-direction:row;height:calc(100vh - 50px);min-height:0;padding:20px;gap:20px;box-sizing:border-box}.earth-stage{flex:1;min-width:0;padding:0}.explore-panel{width:360px;flex-shrink:0;background:var(--he-panel, #050c12);border:1px solid var(--he-border, #29323a);border-radius:24px;overflow:hidden}.list{min-height:0;height:0;flex:1}.hero{padding-top:24px!important}}
.hero { padding: 14px 16px 8px; }
.hero-title { display: block; font-size: 28px; font-weight: 700; color: var(--he-text, #f4f8f2); }
.hero-sub { display: block; margin-top: 4px; font-size: 12px; color: var(--he-muted, #a7b5aa); }
.online-search { display:flex;flex-direction:column;gap:6px;padding:6px 16px;font-size:12px;color:var(--he-muted, #a7b5aa); }
.search-box { margin-top: 12px; background: var(--he-surface, #151f24); border-radius: 8px; padding: 4px 12px; }
.search-input { height: 32px; font-size: 14px; color: var(--he-text, #f4f8f2); }
.ph { color: var(--he-muted, #a7b5aa); }
.chips { white-space: nowrap; padding: 4px 0; }
.chips-inner { display: inline-flex; gap: 8px; padding: 0 16px; }
.chip { padding: 5px 12px; font-size: 12px; color: var(--he-muted, #a7b5aa); background: var(--he-surface, #151f24); border-radius: 499.5px; }
.chip.on { color: var(--he-bg, #01030a); background: var(--he-accent, #b8f36b); font-weight: 600; }
.list { height:420px; flex: none; padding: 4px 16px 0; box-sizing: border-box; }
.card { background: var(--he-panel, #050c12); border-radius: 10px; padding: 12px; margin-bottom: 12px; }
.card-head { display: flex; align-items: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.card-status { font-size: 11px; color: var(--he-muted, #a7b5aa); }
.card-region { margin-left: auto; font-size: 11px; color: var(--he-muted, #a7b5aa); }
.card-name { display: block; margin-top: 6px; font-size: 16px; font-weight: 600; color: var(--he-text, #f4f8f2); }
.card-summary { display: block; margin-top: 4px; font-size: 12px; color: var(--he-muted, #a7b5aa); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.card-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; font-size: 11px; color: var(--he-muted, #a7b5aa); }
.card-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tag { font-size: 10px; color: var(--he-muted, #a7b5aa); background: var(--he-surface, #151f24); padding: 3px 8px; border-radius: 4px; }
.tag.nav { color: var(--he-accent, #b8f36b); }
.empty { text-align: center; color: var(--he-muted, #a7b5aa); padding: 40px 0; font-size: 13px; }
.disclaimer { text-align: center; color: var(--he-muted, #a7b5aa); font-size: 10px; padding: 12px 0 24px; }
</style>
