<template><scroll-view scroll-y class="page">
  <text class="title">社区举报处理</text><text class="hint">仅授权管理员可处理举报。</text><button :disabled="busy" @click="load">刷新待处理举报</button>
  <text class="hint">{{ message }}</text>
  <view v-for="report in reports" :key="report.id" class="card">
    <text class="title">{{ report.post?.title || '帖子已不存在' }}</text><text class="hint">{{ report.post?.nickname }} · {{ new Date(report.createdAt).toLocaleString() }}</text>
    <text class="content">{{ report.post?.content }}</text><text class="reason">举报理由：{{ report.reason }}</text>
    <button :disabled="busy" @click="handle(report.id, 'hide')">隐藏帖子</button><button :disabled="busy" @click="handle(report.id, 'dismiss')">无需处理 / 关闭举报</button>
  </view>
</scroll-view></template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { callCloud } from '@/services/cloud';
type Report = { id: string; reason: string; createdAt: number; post: { title: string; content: string; nickname: string; status: string } | null };
const reports = ref<Report[]>([]), message = ref(''), busy = ref(false);
onShow(load);
async function load() {
  if (busy.value) return; busy.value = true;
  try { const result = await callCloud<{ reports: Report[] }>('community-moderate', { action: 'list' });
    reports.value = result.ok ? result.data?.reports || [] : []; message.value = result.ok ? reports.value.length ? '' : '暂无待处理举报' : result.errMsg || '加载失败';
  } finally { busy.value = false; }
}
function handle(id: string, action: string) {
  uni.showModal({ title: action === 'hide' ? '隐藏帖子' : '关闭举报', content: '确认提交处理结果？', success: async r => {
    if (!r.confirm || busy.value) return; busy.value = true;
    try { const result = await callCloud('community-moderate', { reportId: id, action }); message.value = result.ok ? '已处理' : result.errMsg || '处理失败'; }
    finally { busy.value = false; } await load();
  } });
}
</script>
<style scoped>.page{height:100vh;background:#0f141b;color:#eef4ea;padding:24px;box-sizing:border-box}.title{display:block;font-size:20px}.hint{display:block;color:#8a97a5;font-size:13px;margin:12px 0}.card{padding:16px;margin:16px 0;background:#151d27;border-radius:12px}.content,.reason{display:block;margin:12px 0;font-size:14px}.reason{color:#ffd166}button{margin-top:12px;font-size:14px;background:#b8f36b}</style>
