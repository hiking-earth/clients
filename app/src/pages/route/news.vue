<template><scroll-view scroll-y class="page"><text class="title">官方户外公告</text><text class="hint">仅展示来源标题和原文链接。公告可能仍包含历史事件，请打开原文确认日期与适用范围。最新采集：{{news.generatedAt||'尚未获取'}}</text><view v-for="source in news.sources" :key="source.id"><text>{{source.label}} · 上次成功 {{source.lastSuccess||'尚无成功记录'}}{{source.lastError?' · 最近采集失败，保留旧资料':''}}</text></view><input v-model="keyword" placeholder="搜索标题或地区" /><text>{{news.error}}</text><button :disabled="news.loading" @click="refreshNews(true)">更新公告</button><view v-for="item in filtered" :key="item.id" class="card"><text class="title">{{item.title}}</text><text>{{item.sourceLabel}} · {{item.region}}</text><text>发布日期 {{item.publishedAt||'来源未提供日期'}}</text><button @click="open(item.url)">查看官方原文</button></view><text v-if="!filtered.length">当前没有符合条件的官方公告</text></scroll-view></template>
<script setup lang="ts">
import {ref,computed} from 'vue';import {onShow} from '@dcloudio/uni-app';import {news,refreshNews} from '@/services/news';
const keyword=ref('');const filtered=computed(()=>news.items.filter(r=>`${r.title} ${r.region}`.toLowerCase().includes(keyword.value.toLowerCase())));
onShow(()=>{void refreshNews();});function open(url:string){
 // #ifdef APP-PLUS
 plus.runtime.openURL(url);return;
 // #endif
 // #ifdef H5
 window.open(url,'_blank','noopener,noreferrer');return;
 // #endif
 // #ifdef MP-WEIXIN
 uni.setClipboardData({data:url});
 // #endif
}
</script><style scoped>.page{padding:30rpx;box-sizing:border-box;background:#0f141b;color:#eef4ea;min-height:100vh}.card{padding:24rpx;margin:20rpx 0;background:#1a2430;border-radius:20rpx}text{display:block;margin:16rpx 0}.title{font-size:34rpx}.hint{color:#8a97a5}input{padding:20rpx;background:#1a2430}</style>
