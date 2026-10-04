<template>
  <view class="page">
    <scroll-view scroll-y class="list">
      <view v-for="p in posts" :key="p.id" class="card" @longpress="reportPost(p)">
        <view class="card-head">
          <text class="nick">{{ p.nickname }}</text>
          <text class="date">{{ p.departDate }} 出发</text>
        </view>
        <text class="title">{{ p.title }}{{ p.status === 'closed' ? ' · 已关闭' : '' }}</text>
        <text class="content">{{ p.content }}</text>
        <view class="card-foot">
          <text class="members">{{ (p.memberCount ?? p.members.length) }}/{{ p.maxMembers }} 人</text>
          <text v-if="routeName(p.routeId)" class="route">{{ routeName(p.routeId) }}</text>
          <view
            class="join" :class="{ full: (p.memberCount ?? p.members.length) >= p.maxMembers || joined(p) }"
            @click="join(p)"
          >{{ p.status === 'closed' ? '已关闭' : joined(p) ? '已报名' : (p.memberCount ?? p.members.length) >= p.maxMembers ? '已满员' : '报名' }}</view>
        </view>
        <button v-if="myOpenid && p.openid === myOpenid" size="mini" @click="managePost(p)">管理活动</button>
        <button v-else-if="joined(p)" size="mini" @click="cancelJoin(p)">取消报名</button>
      </view>
      <view v-if="posts.length === 0" class="empty">{{ loadError || "还没有约伴帖，来发第一条" }}</view>
      <view class="notice">社区内容经机审过滤；请勿发布他人位置等敏感信息。发现违规可长按帖子举报。</view>
    </scroll-view>

    <view class="fab" @click="newPost">＋ 发约伴</view>

    <!-- 发帖弹窗 -->
    <view v-if="showForm" class="mask" @click="showForm = false">
      <view class="form" @click.stop>
        <text class="form-title">{{ editingId ? '编辑约伴' : '发约伴' }}</text>
        <input v-model="form.title" class="input" placeholder="标题（如：武功山两日轻装）" placeholder-class="ph" />
        <textarea v-model="form.content" class="textarea" placeholder="时间、集合点、强度要求…" placeholder-class="ph" />
        <input v-model="form.departDate" class="input" placeholder="出发日期 YYYY-MM-DD" placeholder-class="ph" />
        <input v-model.number="form.maxMembers" type="number" class="input" placeholder="人数上限" placeholder-class="ph" />
        <picker mode="selector" :range="routeNames" @change="onPickRoute">
          <view class="input picker">{{ form.routeId ? routeName(form.routeId) : '关联路线（可选）' }}</view>
        </picker>
        <view class="form-actions">
          <button class="btn ghost" @click="showForm = false">取消</button>
          <button class="btn primary" :disabled="submitting" @click="submit">{{ editingId ? '保存' : '发布' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { ROUTES } from "@shared/data/routes.seed";
import type { CompanionPost } from "@shared/types/social";
import { callCloud } from "@/services/cloud";

const posts = ref<CompanionPost[]>([]);
const showForm = ref(false);
const editingId = ref('');
const submitting = ref(false);
const myOpenid = ref("");
const loadError = ref("");
const form = ref({ title: "", content: "", departDate: "", maxMembers: 4, routeId: "" });

const routeNames = ROUTES.map((r) => r.name);

onShow(load);

async function load() {
  const login = await callCloud<{ openid: string }>("login");
  myOpenid.value = login.ok ? login.data?.openid ?? "" : "";
  const res = await callCloud<{ posts: CompanionPost[] }>("companion-list");
  if (res.ok && res.data) { posts.value = res.data.posts; loadError.value = ""; }
  else { posts.value = []; loadError.value = res.errMsg ?? "加载失败"; }
}

function routeName(id?: string): string {
  return ROUTES.find((r) => r.id === id)?.name ?? "";
}

function joined(p: CompanionPost): boolean {
  return p.members.includes(myOpenid.value);
}

function onPickRoute(e: any) {
  form.value.routeId = ROUTES[e.detail.value]?.id ?? "";
}

async function join(p: CompanionPost) {
  if (p.status === 'closed' || joined(p) || (p.memberCount ?? p.members.length) >= p.maxMembers) return;
  const res = await callCloud("companion-join", { postId: p.id });
  if (res.ok) {
    await load();
    uni.showToast({ title: "已报名", icon: "success" });
  } else {
    uni.showToast({ title: "报名失败", icon: "none" });
  }
}

function newPost() {
  editingId.value = ''; form.value = { title: '', content: '', departDate: '', maxMembers: 4, routeId: '' }; showForm.value = true;
}
async function cancelJoin(post: CompanionPost) {
  uni.showModal({ title: '取消报名', content: '确认退出该活动？', success: async result => {
    if (result.confirm) await changePost(post, 'leave');
  } });
}
function managePost(post: CompanionPost) {
  const labels = ['编辑活动', post.status === 'closed' ? '重新开放报名' : '关闭报名', '删除活动'];
  uni.showActionSheet({ itemList: labels, success: choice => {
    if (choice.tapIndex === 0) {
      editingId.value = post.id; form.value = { title: post.title, content: post.content, departDate: post.departDate, maxMembers: post.maxMembers, routeId: post.routeId || '' }; showForm.value = true; return;
    }
    const action = choice.tapIndex === 2 ? 'delete' : post.status === 'closed' ? 'reopen' : 'close';
    uni.showModal({ title: labels[choice.tapIndex], content: action === 'delete' ? '删除后活动内容不再展示。此操作无法恢复。' : '确认更新报名状态？', success: async result => {
      if (result.confirm) await changePost(post, action);
    } });
  } });
}
async function changePost(post: CompanionPost, action: string) {
  const result = await callCloud('companion-manage', { postId: post.id, action });
  if (result.ok) await load();
  uni.showToast({ title: result.ok ? '已更新' : result.errMsg || '操作失败', icon: 'none' });
}
function reportPost(p: CompanionPost) {
  uni.showActionSheet({ itemList: ["垃圾广告", "人身攻击或违法内容", "泄露个人信息", "其他违规内容"], success: async (r) => {
    const reasons = ["垃圾广告", "人身攻击或违法内容", "泄露个人信息", "其他违规内容"];
    const result = await callCloud("companion-report", { postId: p.id, reason: reasons[r.tapIndex] });
    uni.showToast({ title: result.ok ? "举报已提交，等待处理" : result.errMsg ?? "举报失败", icon: "none" });
  } });
}

async function submit() {
  if (!form.value.title.trim() || !form.value.content.trim()) {
    uni.showToast({ title: "请填写标题和内容", icon: "none" });
    return;
  }
  submitting.value = true;
  // 内容安全机审（云函数内 security.msgSecCheck）
  const res = await callCloud(editingId.value ? 'companion-manage' : 'companion-create', {
    ...(editingId.value ? { postId: editingId.value, action: 'edit' } : {}),
    ...form.value,
    nickname: uni.getStorageSync('he_nickname') || '山友',
  });
  submitting.value = false;
  if (res.ok) {
    showForm.value = false;
    form.value = { title: "", content: "", departDate: "", maxMembers: 4, routeId: "" };
    uni.showToast({ title: "已发布", icon: "success" });
    load();
  } else {
    uni.showToast({ title: res.errMsg ?? "发布失败", icon: "none" });
  }
}
</script>

<style lang="scss" scoped>
.page { height: 100vh; background: #0f141b; }
.list { height: 100%; padding: 24rpx 32rpx; box-sizing: border-box; }
.card { background: #151d27; border-radius: 20rpx; padding: 28rpx 24rpx; margin-bottom: 20rpx; }
.card-head { display: flex; justify-content: space-between; }
.nick { font-size: 24rpx; color: #b8f36b; }
.date { font-size: 22rpx; color: #5c6a78; }
.title { display: block; margin-top: 12rpx; font-size: 32rpx; font-weight: 600; color: #eef4ea; }
.content { display: block; margin-top: 8rpx; font-size: 26rpx; color: #8a97a5; line-height: 1.6; }
.card-foot { display: flex; align-items: center; margin-top: 16rpx; gap: 16rpx; }
.members { font-size: 22rpx; color: #aeb9c4; }
.route { flex: 1; font-size: 22rpx; color: #5c6a78; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.join { padding: 8rpx 32rpx; background: #b8f36b; color: #0f141b; font-size: 24rpx; font-weight: 600; border-radius: 999rpx; }
.join.full { background: #1a2430; color: #5c6a78; }
.empty { text-align: center; color: #5c6a78; padding: 80rpx 0; font-size: 26rpx; }
.notice { margin: 24rpx 0 160rpx; font-size: 20rpx; color: #445059; line-height: 1.7; }
.fab { position: fixed; right: 32rpx; bottom: calc(48rpx + env(safe-area-inset-bottom)); padding: 20rpx 36rpx; background: #b8f36b; color: #0f141b; font-size: 28rpx; font-weight: 600; border-radius: 999rpx; box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.4); }
.mask { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: flex-end; }
.form { width: 100%; background: #151d27; border-radius: 32rpx 32rpx 0 0; padding: 40rpx 32rpx calc(40rpx + env(safe-area-inset-bottom)); }
.form-title { display: block; font-size: 32rpx; font-weight: 600; color: #eef4ea; margin-bottom: 24rpx; }
.input { background: #1a2430; border-radius: 16rpx; padding: 20rpx 24rpx; font-size: 28rpx; color: #eef4ea; margin-bottom: 16rpx; }
.textarea { background: #1a2430; border-radius: 16rpx; padding: 20rpx 24rpx; font-size: 28rpx; color: #eef4ea; margin-bottom: 16rpx; height: 160rpx; width: auto; }
.picker { color: #8a97a5; }
.ph { color: #5c6a78; }
.form-actions { display: flex; gap: 24rpx; margin-top: 8rpx; }
.btn { flex: 1; border-radius: 999rpx; font-size: 28rpx; }
.btn.ghost { background: #1a2430; color: #8a97a5; }
.btn.primary { background: #b8f36b; color: #0f141b; font-weight: 600; }
</style>
