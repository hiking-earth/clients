<template>
  <scroll-view scroll-y class="page">
    <view class="intro">
      <text class="intro-title">装备导购</text>
      <text class="intro-sub">个人主体导购模式 · 跳转第三方成交 · 不自营收款</text>
    </view>

    <scroll-view scroll-x class="chips" :show-scrollbar="false">
      <view class="chips-inner">
        <view
          v-for="c in categories" :key="c"
          class="chip" :class="{ on: category === c }"
          @click="category = category === c ? '' : c"
        >{{ c || '全部' }}</view>
      </view>
    </scroll-view>

    <text v-if="error" class="notice">{{error}}</text>
    <button :disabled="loading" @click="load">{{loading ? "正在加载" : "更新导购资料"}}</button>
    <view class="list">
      <view v-for="it in filtered" :key="it.id" class="card" @click="open(it)">
        <view class="card-l">
          <text class="card-title">{{ it.title }}</text>
          <text class="card-summary">{{ it.summary }}</text>
          <view class="card-foot">
            <text class="cat">{{ it.category }}</text>
            <text v-if="it.priceHint" class="price">{{ it.priceHint }}</text>
          </view>
        </view>
        <text class="go">›</text>
      </view>
      <view v-if="filtered.length === 0" class="empty">{{ loading ? "正在加载" : error ? "未取得导购资料" : "暂无已发布的导购条目" }}</view>
    </view>

    <view class="notice">导购链接跳转至第三方平台成交，价格与售后以第三方为准；本应用不收取货款。</view>
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import type { GuideItem } from "@shared/types/social";
import { callCloud } from "@/services/cloud";

const items = ref<GuideItem[]>([]);
const category = ref("");
const loading=ref(false),error=ref("");
const categories = ["", "鞋靴", "背包", "服装", "露营", "导航", "应急", "其他"];

function safeLink(value:unknown):value is string {
  return typeof value === "string" && value.length <= 2048 && /^https:\/\/[^\s/@:#?]+(?:\:443)?\/[^\\\s\u0000-\u001f\u007f]*$/.test(value);
}
async function load() {
  if(loading.value)return;
  loading.value=true;error.value="";
  try {
    const res=await callCloud<{items:GuideItem[]}>("guide-list");
    if(!res.ok || !res.data || !Array.isArray(res.data.items))throw new Error("未取得导购资料，请稍后重试");
    const rows=res.data.items;
    if(rows.length>100 || rows.some(i=>!i || typeof i.id!=="string" || !i.id || typeof i.title!=="string" || !i.title.trim() || i.title.length>200 || typeof i.summary!=="string" || i.summary.length>2000 || !categories.includes(i.category) || !i.category || !safeLink(i.link)) || new Set(rows.map(i=>i.id)).size!==rows.length)throw new Error("导购资料格式有误，请稍后重试");
    items.value=rows;
  }catch(e){items.value=[];error.value=e instanceof Error?e.message:"加载失败，请稍后重试";}
  finally{loading.value=false;}
}
onLoad(()=>{void load();});

const filtered = computed(() =>
  category.value ? items.value.filter((i) => i.category === category.value) : items.value,
);

function open(it: GuideItem) {
  if (!safeLink(it.link)) {
    uni.showToast({ title: "导购链接待配置", icon: "none" });
    return;
  }
  // #ifdef H5
  window.open(it.link, "_blank", "noopener,noreferrer");
  // #endif
  // #ifdef APP-PLUS
  plus.runtime.openURL(it.link);
  // #endif
  // #ifdef MP-WEIXIN
  uni.setClipboardData({
    data: it.link,
    success: () => uni.showToast({ title: "链接已复制，去浏览器打开", icon: "none" }),
  });
  // #endif
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #0f141b; }
.intro { padding: 40rpx 32rpx 16rpx; }
.intro-title { display: block; font-size: 44rpx; font-weight: 700; color: #eef4ea; }
.intro-sub { display: block; margin-top: 8rpx; font-size: 22rpx; color: #8a97a5; }
.chips { white-space: nowrap; padding: 8rpx 0; }
.chips-inner { display: inline-flex; gap: 16rpx; padding: 0 32rpx; }
.chip { padding: 10rpx 24rpx; font-size: 24rpx; color: #8a97a5; background: #1a2430; border-radius: 999rpx; }
.chip.on { color: #0f141b; background: #b8f36b; font-weight: 600; }
.list { padding: 16rpx 32rpx 0; }
.card { display: flex; align-items: center; background: #151d27; border-radius: 20rpx; padding: 28rpx 24rpx; margin-bottom: 16rpx; }
.card-l { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.card-title { font-size: 30rpx; font-weight: 600; color: #eef4ea; }
.card-summary { font-size: 24rpx; color: #8a97a5; line-height: 1.5; }
.card-foot { display: flex; gap: 16rpx; margin-top: 4rpx; }
.cat { font-size: 20rpx; color: #b8f36b; background: #1a2430; padding: 4rpx 14rpx; border-radius: 8rpx; }
.price { font-size: 22rpx; color: #ffd166; }
.go { font-size: 40rpx; color: #5c6a78; }
.empty { text-align: center; color: #5c6a78; font-size: 24rpx; padding: 64rpx 0; }
.notice { margin: 24rpx 32rpx 64rpx; font-size: 20rpx; color: #445059; line-height: 1.7; }
</style>
