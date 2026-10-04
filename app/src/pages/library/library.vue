<template>
  <scroll-view scroll-y class="page">
    <text class="title">收藏与行程</text><text class="hint">资料保存在本机，仅点击云端保存时上传。行程不会改变路线的开放状态。</text>
    <text class="heading">收藏路线</text>
    <view v-for="id in library.favorites" :key="id" class="card"><text @click="detail(id)">{{ routeName(id) }}</text><button size="mini" @click="unfavorite(id)">取消收藏</button></view>
    <text v-if="!library.favorites.length" class="hint">在路线详情中收藏路线。</text>
    <text class="heading">创建行程</text>
    <picker :range="routeNames" @change="pick"><view class="input">{{ selected ? routeName(selected) : '选择路线' }}</view></picker>
    <input v-model="date" class="input" placeholder="出发日期 YYYY-MM-DD" />
    <textarea v-model="notes" maxlength="2000" class="input" placeholder="集合点、交通、住宿和装备备忘" />
    <button @click="addPlan">保存行程</button>
    <view v-for="plan in library.plans" :key="plan.id" class="card">
      <text class="heading" @click="detail(plan.routeId)">{{ routeName(plan.routeId) }} · {{ plan.date }}</text>
      <textarea v-model="plan.notes" maxlength="2000" class="input" @blur="persist" />
      <button size="mini" @click="plan.packed = !plan.packed; persist()">{{ plan.packed ? '✓ 装备已检查' : '标记装备已检查' }}</button>
      <button size="mini" @click="removePlan(plan.id)">删除行程</button>
    </view>
    <text class="heading">云端资料</text><button :disabled="busy" @click="push">保存收藏与行程到当前账号</button><button :disabled="busy" @click="pull">恢复当前账号的收藏与行程</button><text class="hint">{{ message }}</text>
  </scroll-view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { ROUTES } from '@shared/data/routes.seed';
import { readLibrary, writeLibrary, toggleFavorite, libraryVersion, setLibraryVersion } from '@/services/library';
import type { Library } from '@/services/library';
import { callCloud } from '@/services/cloud';
const library = ref(readLibrary()), selected = ref(''), date = ref(''), notes = ref(''), message = ref(''), busy = ref(false);
const routeNames = ROUTES.map(r => r.name);
onShow(() => { library.value = readLibrary(); });
function routeName(id: string) { return ROUTES.find(r => r.id === id)?.name || '路线资料暂不可用'; }
function detail(id: string) { uni.navigateTo({ url: `/pages/route/detail?id=${encodeURIComponent(id)}` }); }
function pick(e: any) { selected.value = ROUTES[Number(e.detail.value)]?.id || ''; }
function persist() { try { writeLibrary(library.value); } catch { message.value = '本机保存失败，请检查存储空间'; } }
function unfavorite(id: string) { try { toggleFavorite(id); library.value = readLibrary(); } catch { message.value = '本机保存失败'; } }
function addPlan() {
  if (!selected.value || !/^\d{4}-\d{2}-\d{2}$/.test(date.value) || Number.isNaN(Date.parse(date.value)) || new Date(date.value).toISOString().slice(0,10) !== date.value) { message.value = '请选择路线并填写有效日期'; return; }
  if (library.value.plans.length >= 100) { message.value = '最多保存100个行程'; return; }
  library.value.plans.unshift({ id: `plan-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, routeId: selected.value, date: date.value, notes: notes.value, packed: false }); persist(); notes.value = '';
}
function removePlan(id: string) { uni.showModal({ title: '删除行程', content: '确认删除该行程？', success: r => { if (r.confirm) { library.value.plans = library.value.plans.filter(p => p.id !== id); persist(); } } }); }
async function push() {
  if (busy.value) return; busy.value = true;
  const owner = String(uni.getStorageSync('he_openid') || '');
  try { const result = await callCloud<{ version: number }>('library-manage', { action: 'save', ...library.value, version: libraryVersion() });
    if (owner !== String(uni.getStorageSync('he_openid') || '')) return;
    if (result.ok && result.data) { setLibraryVersion(result.data.version); message.value = '云端资料已保存'; } else message.value = result.errMsg || '保存失败';
  } finally { busy.value = false; }
}
function pull() {
  uni.showModal({ title: '恢复云端资料', content: '用当前账号的云端收藏与行程替换本机资料。', success: async choice => {
    if (!choice.confirm || busy.value) return; busy.value = true;
    const owner = String(uni.getStorageSync('he_openid') || '');
    try { const result = await callCloud<Library & { version: number }>('library-manage', { action: 'get' });
      if (owner !== String(uni.getStorageSync('he_openid') || '')) return;
      if (result.ok && result.data) { writeLibrary({ favorites: result.data.favorites, plans: result.data.plans }); setLibraryVersion(result.data.version); library.value = readLibrary(); message.value = '已恢复'; }
      else message.value = result.errMsg || '恢复失败';
    } catch { message.value = '本机保存失败'; } finally { busy.value = false; }
  } });
}
</script>
<style scoped>
.page{height:100vh;box-sizing:border-box;padding:24px 20px;background:#0f141b;color:#eef4ea}.title{display:block;font-size:24px;font-weight:700}.hint{display:block;margin:12px 0;color:#8a97a5;font-size:13px;line-height:1.7}.heading{display:block;font-weight:600;margin:20px 0 12px}.card{background:#151d27;padding:16px;border-radius:12px;margin-bottom:12px}.input{background:#202b37;padding:12px;box-sizing:border-box;width:100%;margin:12px 0;border-radius:8px}button{font-size:14px;margin:10px 0;background:#b8f36b;color:#0f141b}
</style>
