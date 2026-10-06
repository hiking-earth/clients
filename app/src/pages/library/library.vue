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
    <view v-if="legacy" class="card"><text class="hint">发现旧版本未绑定账号的本机资料（{{ legacy.favorites.length }} 条收藏、{{ legacy.plans.length }} 个行程）。这些资料不会自动并入账号或上传。</text><button :disabled="busy" @click="confirmLegacyImport">合并到当前本机资料</button></view>
    <text class="heading">云端资料</text><button :disabled="busy || !owner" @click="push">保存收藏与行程到当前账号</button><button :disabled="busy || !owner" @click="pull">恢复当前账号的收藏与行程</button><text v-if="!owner" class="hint">登录统一账号后可使用云端资料。</text><text class="hint">{{ message }}</text>
  </scroll-view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { ROUTES } from '@/services/route-catalog';
import { readLibrary, writeLibrary, toggleFavorite, libraryVersion, setLibraryVersion, validCloudLibrary, libraryOwner, legacyLibrary, importLegacyLibrary } from '@/services/library';
import type { Library } from '@/services/library';
import { onAccountChange } from '@/services/account';
import { callCloud } from '@/services/cloud';
const library = ref(readLibrary()), selected = ref(''), date = ref(''), notes = ref(''), message = ref(''), busy = ref(false);
const owner = ref(libraryOwner()), legacy = ref(legacyLibrary());
let loadedOwner = owner.value;
const routeNames = ROUTES.map(r => r.name);
function refreshLibrary() { owner.value = libraryOwner(); loadedOwner = owner.value; library.value = readLibrary(); legacy.value = legacyLibrary(); }
onShow(refreshLibrary);
onAccountChange(refreshLibrary);
function routeName(id: string) { return ROUTES.find(r => r.id === id)?.name || '路线资料暂不可用'; }
function detail(id: string) { uni.navigateTo({ url: `/pages/route/detail?id=${encodeURIComponent(id)}` }); }
function pick(e: any) { selected.value = ROUTES[Number(e.detail.value)]?.id || ''; }
function sameOwner(): boolean { if (loadedOwner === libraryOwner()) return true; refreshLibrary(); message.value = '账号已切换，已载入该账号独立保存的资料'; return false; }
function persist() { if (!sameOwner()) return; try { writeLibrary(library.value); } catch { message.value = '本机保存失败，请检查存储空间'; } }
function unfavorite(id: string) { if (!sameOwner()) return; try { toggleFavorite(id); library.value = readLibrary(); } catch { message.value = '本机保存失败'; } }
function addPlan() {
  if (!sameOwner()) return;
  if (!selected.value || !/^\d{4}-\d{2}-\d{2}$/.test(date.value) || Number.isNaN(Date.parse(date.value)) || new Date(date.value).toISOString().slice(0,10) !== date.value) { message.value = '请选择路线并填写有效日期'; return; }
  if (library.value.plans.length >= 100) { message.value = '最多保存100个行程'; return; }
  library.value.plans.unshift({ id: `plan-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, routeId: selected.value, date: date.value, notes: notes.value, packed: false }); persist(); notes.value = '';
}
function removePlan(id: string) { uni.showModal({ title: '删除行程', content: '确认删除该行程？', success: r => { if (r.confirm && sameOwner()) { library.value.plans = library.value.plans.filter(p => p.id !== id); persist(); } } }); }
function confirmLegacyImport() {
  if (busy.value) return;
  const target = libraryOwner();
  const destination = target ? '当前登录账号的本机资料' : '本机匿名资料';
  uni.showModal({ title: '导入旧版本机资料', content: `将旧版本中未绑定账号的收藏和行程合并到${destination}，不会直接上传云端。继续前请确认这些资料属于你。`, success: result => {
    if (!result.confirm || target !== libraryOwner()) return;
    try { const imported = importLegacyLibrary(); refreshLibrary(); message.value = `已合并旧资料：${imported.favorites} 条收藏、${imported.plans} 个行程`; }
    catch (e: any) { message.value = e?.message || '合并失败，旧资料仍保留'; }
  } });
}
async function push() {
  if (busy.value) return; busy.value = true;
  const requestOwner = libraryOwner();
  if (!requestOwner) { busy.value = false; message.value = '请先登录统一账号'; return; }
  if (!sameOwner()) { busy.value = false; return; }
  const snapshot=JSON.parse(JSON.stringify(library.value)) as Library;
  const version=libraryVersion();
  try { const result = await callCloud<{ version: number }>('library-manage', { action: 'save', ...snapshot, version });
    if (requestOwner !== libraryOwner()) return;
    if (result.ok && result.data) { if(!Number.isSafeInteger(result.data.version)||result.data.version!==version+1){message.value='云端版本响应无效，请重新同步';return;} setLibraryVersion(result.data.version,snapshot); message.value = '云端资料已保存'; } else message.value = result.errMsg || '保存失败';
  } catch { if(requestOwner===libraryOwner())message.value='云端保存未完成，请稍后重试'; } finally { busy.value = false; }
}
function pull() {
  uni.showModal({ title: '恢复云端资料', content: '用当前账号的云端收藏与行程替换本机资料。', success: async choice => {
    if (!choice.confirm || busy.value) return; busy.value = true;
    const requestOwner = libraryOwner();
    if (!requestOwner) { busy.value = false; message.value = '请先登录统一账号'; return; }
    if (!sameOwner()) { busy.value = false; return; }
    const original=JSON.stringify(readLibrary());
    try { const result = await callCloud<Library & { version: number }>('library-manage', { action: 'get' });
      if (requestOwner !== libraryOwner()) return;
      if(JSON.stringify(readLibrary())!==original){message.value='本机资料已变化，请重新确认恢复';return;}
      if (result.ok && result.data) { if(!validCloudLibrary(result.data)){message.value='云端资料格式无效，本机资料未覆盖';return;} writeLibrary({ favorites: result.data.favorites, plans: result.data.plans }); setLibraryVersion(result.data.version); library.value = readLibrary(); message.value = '已恢复'; }
      else message.value = result.errMsg || '恢复失败';
    } catch { if(requestOwner===libraryOwner())message.value = '本机保存失败'; } finally { busy.value = false; }
  } });
}
</script>
<style scoped>
.page{height:100vh;box-sizing:border-box;padding:24px 20px;background:#0f141b;color:#eef4ea}.title{display:block;font-size:24px;font-weight:700}.hint{display:block;margin:12px 0;color:#8a97a5;font-size:13px;line-height:1.7}.heading{display:block;font-weight:600;margin:20px 0 12px}.card{background:#151d27;padding:16px;border-radius:12px;margin-bottom:12px}.input{background:#202b37;padding:12px;box-sizing:border-box;width:100%;margin:12px 0;border-radius:8px}button{font-size:14px;margin:10px 0;background:#b8f36b;color:#0f141b}
</style>
