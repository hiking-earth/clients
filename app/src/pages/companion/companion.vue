<template>
  <view class="page">
    <scroll-view scroll-y class="list">
      <view v-for="p in posts" :key="p.id" class="card" @longpress="reportPost(p)">
        <view class="card-head">
          <text class="nick">{{ p.nickname }}</text>
          <text class="date">{{ p.departDate }} 出发</text>
        </view>
        <text class="title">{{ p.title }}{{ p.status === 'pending' ? ' · 待审核' : p.status === 'closed' ? ' · 已关闭' : '' }}</text>
        <text class="content">{{ p.content }}</text>
        <view class="card-foot">
          <text class="members">{{ (p.memberCount ?? p.members.length) }}/{{ p.maxMembers }} 人</text>
          <text v-if="routeName(p.routeId)" class="route">{{ routeName(p.routeId) }}</text>
          <view
            class="join" :class="{ full: (p.memberCount ?? p.members.length) >= p.maxMembers || joined(p) }"
            @click="join(p)"
          >{{ p.status === 'pending' ? '待审核' : p.status === 'closed' ? '已关闭' : joined(p) ? '已报名' : (p.memberCount ?? p.members.length) >= p.maxMembers ? '已满员' : '报名' }}</view>
        </view>
        <button v-if="myOpenid && p.openid === myOpenid" size="mini" @click="managePost(p)">管理活动</button>
        <button v-if="myOpenid && p.openid === myOpenid" size="mini" @click="contacts(p)">查看报名联系信息</button>
        <button v-else-if="joined(p)" size="mini" @click="cancelJoin(p)">取消报名</button>
      </view>
      <view v-if="posts.length === 0" class="empty">{{ loadError || "还没有约伴帖，来发第一条" }}</view>
      <view class="notice">社区内容发布前需要审核；请勿发布他人位置等敏感信息。发现违规可长按帖子举报。</view>
    </scroll-view>

    <view v-if="joiningPost" class="mask" @click="cancelRegistration"><view class="form" @click.stop><text class="form-title">活动报名</text><text>{{joiningPost.title}}</text><input v-model="birth" class="input" placeholder="出生日期 YYYY-MM-DD（不保存完整生日）" /><input v-model="emergency" maxlength="200" class="input" placeholder="紧急联系人姓名与电话" /><view><switch :checked="guardian" @change="guardian=eventValue($event)" /><text>未成年人由监护人填写并确认</text></view><view><switch :checked="contactConsent" @change="contactConsent=eventValue($event)" /><text>同意将紧急联系信息提供给活动发起人，取消报名后删除</text></view><button :disabled="submitting" @click="submitRegistration">确认报名</button><button @click="cancelRegistration">取消</button></view></view>
    <view class="fab" @click="newPost">＋ 发约伴</view>

    <!-- 发帖弹窗 -->
    <view v-if="showForm" class="mask" @click="cancelForm">
      <view class="form" @click.stop>
        <text class="form-title">{{ editingId ? '编辑约伴' : '发约伴' }}</text>
        <input v-model="form.title" class="input" placeholder="标题（如：武功山两日轻装）" placeholder-class="ph" />
        <textarea v-model="form.content" class="textarea" placeholder="时间、集合点、强度要求…" placeholder-class="ph" />
        <input v-model="form.departDate" class="input" placeholder="出发日期 YYYY-MM-DD" placeholder-class="ph" />
        <view v-if="!editingId"><input v-model="birth" class="input" placeholder="出生日期 YYYY-MM-DD（用于成年人判断，不保存完整生日）" /><input v-model="emergency" maxlength="200" class="input" placeholder="紧急联系人姓名与电话" /><switch :checked="contactConsent" @change="contactConsent=eventValue($event)" /><text>同意保存本人紧急联系信息，仅本人及发起人可访问</text></view>
        <input v-model.number="form.maxMembers" type="number" class="input" placeholder="人数上限" placeholder-class="ph" />
        <picker mode="selector" :range="routeNames" @change="onPickRoute">
          <view class="input picker">{{ form.routeId ? routeName(form.routeId) : '关联路线（可选）' }}</view>
        </picker>
        <view class="form-actions">
          <button class="btn ghost" @click="cancelForm">取消</button>
          <button class="btn primary" :disabled="submitting" @click="submit">{{ editingId ? '保存' : '发布' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
function eventValue(event: Event): any { return (event as Event & {detail:{value:unknown}}).detail.value; }
import { ref } from "vue";
import { onShow, onHide, onUnload } from "@dcloudio/uni-app";
import { ROUTES } from "@/services/route-catalog";
import type { CompanionPost } from "@shared/types/social";
import { callCloud } from "@/services/cloud";
import { accountSession, onAccountChange } from "@/services/account";
let context = 0, loadSequence = 0;
function identity(){return `${uni.getStorageSync("he_openid")||""}:${accountSession()?.token||""}`;}
function snapshot(){return {owner:identity(),epoch:context};}
function current(value:ReturnType<typeof snapshot>){return value.owner===identity()&&value.epoch===context;}

const birth=ref(''),emergency=ref(''),contactConsent=ref(false),guardian=ref(false),joiningPost=ref<CompanionPost|null>(null);
let creationId=`post-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function clearSensitive(){birth.value='';emergency.value='';contactConsent.value=false;guardian.value=false;}
function cancelRegistration(){joiningPost.value=null;clearSensitive();}
const posts = ref<CompanionPost[]>([]);
const showForm = ref(false);
const editingId = ref('');
const submitting = ref(false);
const myOpenid = ref("");
const loadError = ref("");
const form = ref({ title: "", content: "", departDate: "", maxMembers: 4, routeId: "" });

const routeNames = ROUTES.map((r) => r.name);

function cancelForm(){showForm.value=false;clearSensitive();}
function invalidate(){context++;loadSequence++;cancelRegistration();cancelForm();}
const unsubscribeAccount=onAccountChange(()=>{invalidate();posts.value=[];myOpenid.value="";loadError.value="账号已变化，请刷新活动";});
onHide(invalidate);
onUnload(()=>{invalidate();unsubscribeAccount();});
onShow(load);

async function load() {
  const original=snapshot(), sequence=++loadSequence;
  const login = await callCloud<{ openid: string }>("login");
  if(!current(original)||sequence!==loadSequence)return;
  myOpenid.value = login.ok ? login.data?.openid ?? "" : "";
  const res = await callCloud<{ posts: CompanionPost[] }>("companion-list");
  if(!current(original)||sequence!==loadSequence)return;
  if (res.ok && res.data && Array.isArray(res.data.posts)) { posts.value = res.data.posts; loadError.value = ""; }
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

function join(p:CompanionPost){if(!['open','full'].includes(p.status)||joined(p)||(p.memberCount??p.members.length)>=p.maxMembers)return;clearSensitive();joiningPost.value=p;}
async function submitRegistration(){if(!joiningPost.value||submitting.value)return;submitting.value=true;try{const res=await callCloud('companion-join',{postId:joiningPost.value.id,birth:birth.value,emergency:emergency.value,guardianConfirmed:guardian.value,contactConsent:contactConsent.value,nickname:uni.getStorageSync('he_nickname')||'山友'});if(!res.ok){uni.showToast({title:res.errMsg||'报名失败',icon:'none'});return;}cancelRegistration();await load();uni.showToast({title:'已报名',icon:'success'});}finally{submitting.value=false;}}
async function contacts(p:CompanionPost){const owner=String(uni.getStorageSync('he_openid')||'');const res=await callCloud<{items:{nickname?:string;emergency:string;adult:boolean;guardianConfirmed:boolean}[]}>('companion-manage',{action:'registrations',postId:p.id});if(owner!==String(uni.getStorageSync('he_openid')||''))return;if(!res.ok||!res.data){uni.showToast({title:res.errMsg||'读取失败',icon:'none'});return;}uni.showModal({title:'报名联系信息（仅发起人）',content:res.data.items.map((r,i)=>`${i+1}. ${r.nickname||'山友'}：${r.emergency}；${r.adult?'成年人':'未成年 / 监护人已确认'}`).join('\n')||'当前没有报名联系信息',showCancel:false});}

function newPost() {
  clearSensitive();creationId=`post-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  editingId.value = ''; form.value = { title: '', content: '', departDate: '', maxMembers: 4, routeId: '' }; showForm.value = true;
}
async function cancelJoin(post: CompanionPost) {
  const original=snapshot();
  uni.showModal({ title: '取消报名', content: '确认退出该活动？', success: async result => {
    if (result.confirm && current(original)) await changePost(post, 'leave');
  } });
}
function managePost(post: CompanionPost) {
  const original=snapshot();
  const labels = ['编辑活动', post.status === 'closed' ? '重新开放报名' : '关闭报名', '删除活动'];
  uni.showActionSheet({ itemList: labels, success: choice => {
    if(!current(original)||submitting.value)return;
    if (choice.tapIndex === 0) {
      editingId.value = post.id; form.value = { title: post.title, content: post.content, departDate: post.departDate, maxMembers: post.maxMembers, routeId: post.routeId || '' }; showForm.value = true; return;
    }
    const action = choice.tapIndex === 2 ? 'delete' : post.status === 'closed' ? 'reopen' : 'close';
    uni.showModal({ title: labels[choice.tapIndex], content: action === 'delete' ? '删除后活动内容不再展示。此操作无法恢复。' : '确认更新报名状态？', success: async result => {
      if (result.confirm && current(original)) await changePost(post, action);
    } });
  } });
}
async function changePost(post: CompanionPost, action: string) {
  if(submitting.value)return;
  const original=snapshot();
  const result = await callCloud('companion-manage', { postId: post.id, action });
  if(!current(original))return;
  if (result.ok) await load();
  uni.showToast({ title: result.ok ? '已更新' : result.errMsg || '操作失败', icon: 'none' });
}
function reportPost(p: CompanionPost) {
  const original=snapshot();
  uni.showActionSheet({ itemList: ["垃圾广告", "人身攻击或违法内容", "泄露个人信息", "其他违规内容"], success: async (r) => {
    if(!current(original))return;
    const reasons = ["垃圾广告", "人身攻击或违法内容", "泄露个人信息", "其他违规内容"];
    const result = await callCloud("companion-report", { postId: p.id, reason: reasons[r.tapIndex] });
    if(!current(original))return;
    uni.showToast({ title: result.ok ? "举报已提交，等待处理" : result.errMsg ?? "举报失败", icon: "none" });
  } });
}

async function submit() {
  if(submitting.value)return;
  const original=snapshot();
  if (!form.value.title.trim() || !form.value.content.trim()) {
    uni.showToast({ title: "请填写标题和内容", icon: "none" });
    return;
  }
  submitting.value = true;
  // 内容安全机审（云函数内 security.msgSecCheck）
  const res = await callCloud(editingId.value ? 'companion-manage' : 'companion-create', {
    ...(editingId.value ? { postId: editingId.value, action: 'edit' } : {}),
    ...form.value,
    id:creationId,birth:birth.value,emergency:emergency.value,contactConsent:contactConsent.value,
    nickname: uni.getStorageSync('he_nickname') || '山友',
  });
  submitting.value = false;
  if(!current(original))return;
  if (res.ok) {
    showForm.value = false;clearSensitive();
    form.value = { title: "", content: "", departDate: "", maxMembers: 4, routeId: "" };
    uni.showToast({ title: res.data?.reviewPending || res.data?.status === 'pending' ? '已提交，等待审核' : '已发布', icon: 'success' });
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
