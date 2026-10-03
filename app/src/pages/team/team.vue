<template>
  <view class="page">
    <!-- 未入队 -->
    <view v-if="!team" class="entry">
      <text class="entry-title">组队会合</text>
      <text class="entry-sub">队友实时位置互见 · 双向距离 · 箭头导航会合</text>
      <button class="btn primary" @click="createTeam">创建队伍</button>
      <view class="join-row">
        <input v-model="inviteCode" class="input" placeholder="输入 6 位邀请码" placeholder-class="ph" maxlength="6" />
        <button class="btn ghost" @click="joinTeam">加入</button>
      </view>
      <text class="privacy">位置共享属敏感个人信息，仅在队伍激活期间上报，退出即停止</text>
    </view>

    <!-- 已入队 -->
    <template v-else>
      <view class="team-bar">
        <view class="team-info">
          <text class="team-name">{{ team.name }}</text>
          <text class="team-code" @click="copyCode">邀请码 {{ team.inviteCode }} · 点按复制</text>
        </view>
        <view class="leave" @click="leave">退出</view>
      </view>

      <view v-if="!sharing" class="share-tip">
        <text>位置共享未开启，队友看不到你</text>
        <view class="share-on" @click="startShare">开启共享</view>
      </view>
      <view v-else class="share-tip on">
        <text>位置共享中 · 每 {{ REPORT_INTERVAL / 1000 }} 秒上报</text>
        <view class="share-on off" @click="stopShare">停止</view>
      </view>

      <view v-for="a in alerts" :key="a.id" class="share-tip">
        <text>{{ a.openid === myOpenid ? '你已发出求助信号' : '队友发出求助信号' }}：{{ a.message }} · {{ freshness(a.triggeredAt) }}</text>
        <button v-if="a.openid === myOpenid" size="mini" @click="resolveSos">解除</button>
      </view>
      <!-- 成员列表：实时距离 -->
      <scroll-view scroll-y class="members">
        <view v-for="m in membersWithDistance" :key="m.openid" class="member" @click="rendezvous(m)">
          <view class="avatar">{{ m.nickname.slice(0, 1) }}</view>
          <view class="m-info">
            <text class="m-name">{{ m.nickname }}<text v-if="m.isLeader" class="leader">队长</text><text v-if="m.openid === myOpenid" class="me">我</text></text>
            <text class="m-time">{{ freshness(m.updatedAt) }}</text>
          </view>
          <view class="m-dist">
            <text class="m-dist-v">{{ m.openid === myOpenid ? '—' : m.distanceText }}</text>
            <text v-if="m.openid !== myOpenid" class="m-go">会合 →</text>
          </view>
        </view>
        <view v-if="members.length <= 1" class="empty">还没有队友加入，把邀请码发给 TA</view>
      </scroll-view>

      <view class="tip">点任意队友：箭头实时指向 TA，双向距离随两人移动更新（类苹果查找）</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { onLoad, onShow, onHide } from "@dcloudio/uni-app";
import { formatDistance, haversineM } from "@shared/api/navigation-core";
import type { Team, TeamMember } from "@shared/types/social";
import type { TrackPoint } from "@shared/types/track";
import { callCloud } from "@/services/cloud";
import { startLocationUpdates, stopLocationUpdates } from "@/services/location";
import { hasPrivacyConsent, onPrivacyChange } from "@/services/privacy";

const REPORT_INTERVAL = 10000;

const team = ref<(Team & { teamId?: string }) | null>(null);
const inviteCode = ref("");
type Alert = { id: string; openid: string; message: string; triggeredAt: number };
const alerts = ref<Alert[]>([]);
const members = ref<TeamMember[]>([]);
const myOpenid = ref("");
const sharing = ref(false);
const myPos = ref<TrackPoint | null>(null);
const membersWithDistance = ref<(TeamMember & { distanceText: string })[]>([]);
const onMyLocation = (p: TrackPoint) => { myPos.value = p; };

let reportTimer: ReturnType<typeof setInterval> | null = null;
let remoteQueue: Promise<unknown> = Promise.resolve();
let pollTimer: ReturnType<typeof setInterval> | null = null;

onLoad(async () => {
  const res = await callCloud<{ openid: string }>("login");
  if (!res.ok || !res.data) return;
  myOpenid.value = res.data.openid;
  // 恢复上次队伍
  const saved = uni.getStorageSync("he_team");
  if (saved) {
    try { team.value = JSON.parse(saved); startPoll(); } catch { uni.removeStorageSync("he_team"); }
  }
});

onShow(() => { if (team.value) startPoll(); });
onHide(() => { stopPoll(); stopShare(); });
const unsubscribePrivacy = onPrivacyChange((consents) => {
  if (!consents.location || !consents.teamLocation) stopShare();
});
onUnmounted(() => { unsubscribePrivacy(); stopPoll(); stopShare(); });

async function createTeam() {
  const res = await callCloud<{ teamId: string; inviteCode: string }>("team-create", { name: "徒步小队" });
  if (res.ok && res.data) {
    team.value = {
      id: res.data.teamId, name: "徒步小队", inviteCode: res.data.inviteCode,
      createdBy: myOpenid.value, createdAt: Date.now(), active: true,
    };
    uni.setStorageSync("he_team", JSON.stringify(team.value));
    startPoll();
  } else {
    uni.showToast({ title: res.errMsg ?? "创建失败", icon: "none" });
  }
}

async function joinTeam() {
  if (inviteCode.value.length !== 6) {
    uni.showToast({ title: "请输入 6 位邀请码", icon: "none" });
    return;
  }
  const res = await callCloud<{ team: Team }>("team-join", { inviteCode: inviteCode.value });
  if (res.ok && res.data) {
    team.value = res.data.team;
    uni.setStorageSync("he_team", JSON.stringify(team.value));
    startPoll();
  } else {
    uni.showToast({ title: res.errMsg ?? "加入失败", icon: "none" });
  }
}

function leave() {
  uni.showModal({
    title: "退出队伍？",
    content: "退出后停止位置共享",
    success: async (r) => {
      if (!r.confirm || !team.value) return;
      const teamId = team.value.id;
      stopShare();
      await remoteQueue;
      const result = await callCloud("team-leave", { teamId });
      if (!result.ok) { uni.showToast({ title: result.errMsg ?? "退出失败，请重试", icon: "none" }); return; }
      stopPoll();
      team.value = null;
      members.value = [];
      alerts.value = [];
      uni.removeStorageSync("he_team");
    },
  });
}

/* ---------- 位置上报 ---------- */
let shareGeneration = 0;
let startingShare = false;
async function startShare() {
  if (sharing.value || startingShare || !team.value) return;
  if (!hasPrivacyConsent("location") || !hasPrivacyConsent("teamLocation")) {
    uni.showModal({ title: "需要先启用位置共享", content: "请在“我的 → 隐私设置”中启用定位和组队位置共享，再回来手动开启共享。", showCancel: false });
    return;
  }
  startingShare = true;
  const epoch = ++shareGeneration;
  const ok = await startLocationUpdates(onMyLocation, "team");
  if (epoch !== shareGeneration) return;
  startingShare = false;
  if (!ok) {
    uni.showToast({ title: "定位未启动，未开启共享", icon: "none" });
    return;
  }
  sharing.value = true;
  reportTimer = setInterval(report, REPORT_INTERVAL);
}
function stopShare() {
  const wasSharing = sharing.value;
  const teamId = team.value?.id;
  shareGeneration++;
  startingShare = false;
  sharing.value = false;
  myPos.value = null;
  stopLocationUpdates(onMyLocation);
  if (reportTimer) clearInterval(reportTimer);
  reportTimer = null;
  if (wasSharing && teamId) {
    remoteQueue = remoteQueue.catch(() => {}).then(async () => {
      const res = await callCloud("team-stop", { teamId });
      if (!res.ok) uni.showToast({ title: "本机已停止共享；云端位置清理失败，最多一分钟后不再展示", icon: "none" });
    });
  }
}

async function report() {
  if (!sharing.value || !team.value || !myPos.value || !hasPrivacyConsent("teamLocation") || !hasPrivacyConsent("location")) return;
  const epoch = shareGeneration;
  const payload = { teamId: team.value.id, latitude: myPos.value.latitude, longitude: myPos.value.longitude };
  remoteQueue = remoteQueue.catch(() => {}).then(async () => {
    if (!sharing.value || epoch !== shareGeneration) return;
    const res = await callCloud("team-report", payload);
    if (!res.ok && epoch === shareGeneration) { stopShare(); uni.showToast({ title: res.errMsg ?? "上报失败，共享已停止", icon: "none" }); }
  });
  await remoteQueue;
}

/* ---------- 成员轮询 + 距离计算 ---------- */
function startPoll() {
  stopPoll();
  poll();
  pollTimer = setInterval(poll, REPORT_INTERVAL);
}
function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function poll() {
  if (!team.value) return;
  const id = team.value.id;
  const res = await callCloud<{ members: TeamMember[]; alerts: Alert[] }>("team-locations", { teamId: id });
  if (team.value?.id !== id) return;
  if (res.ok && res.data) {
    members.value = res.data.members;
    alerts.value = res.data.alerts ?? [];
    membersWithDistance.value = res.data.members.map((m) => {
      const d = myPos.value && fresh(m)
        ? haversineM(myPos.value, { latitude: m.latitude!, longitude: m.longitude! })
        : NaN;
      return { ...m, distanceText: isNaN(d) ? "暂无有效位置" : formatDistance(d) };
    });
  }
}

function fresh(m: TeamMember): boolean {
  return Number.isFinite(m.latitude) && Number.isFinite(m.longitude) && m.updatedAt > 0 && Date.now() - m.updatedAt <= 60000;
}
function freshness(ts: number): string {
  if (!ts) return "未共享位置";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "刚刚在线";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  return `${Math.floor(s / 3600)} 小时前`;
}

/** 会合：箭头导航到队友实时位置 */
function rendezvous(m: TeamMember) {
  if (m.openid === myOpenid.value) return;
  if (!fresh(m)) { uni.showToast({ title: "队友位置已过期，暂时不能导航", icon: "none" }); return; }
  uni.navigateTo({
    url: `/pages/navigation/session?mode=member&teamId=${team.value!.id}&memberId=${m.openid}&name=${encodeURIComponent(m.nickname)}`,
  });
}

async function resolveSos() {
  const res = await callCloud("sos-trigger", { action: "resolve" });
  if (res.ok) await poll();
  else uni.showToast({ title: res.errMsg ?? "解除失败", icon: "none" });
}
function copyCode() {
  uni.setClipboardData({ data: team.value!.inviteCode });
}
</script>

<style lang="scss" scoped>
.page { height: 100vh; background: #0f141b; padding: 32rpx; box-sizing: border-box; }
.entry { display: flex; flex-direction: column; padding-top: 80rpx; }
.entry-title { font-size: 48rpx; font-weight: 700; color: #eef4ea; }
.entry-sub { margin-top: 8rpx; font-size: 24rpx; color: #8a97a5; }
.btn { margin-top: 32rpx; border-radius: 999rpx; font-size: 30rpx; }
.btn.primary { background: #b8f36b; color: #0f141b; font-weight: 600; }
.btn.ghost { background: #1a2430; color: #eef4ea; width: 180rpx; margin-top: 0; }
.join-row { display: flex; gap: 16rpx; margin-top: 24rpx; align-items: center; }
.input { flex: 1; background: #1a2430; border-radius: 999rpx; padding: 20rpx 32rpx; font-size: 28rpx; color: #eef4ea; }
.ph { color: #5c6a78; }
.privacy { margin-top: 48rpx; font-size: 20rpx; color: #445059; line-height: 1.7; }
.team-bar { display: flex; align-items: center; background: #151d27; border-radius: 20rpx; padding: 24rpx; }
.team-info { flex: 1; display: flex; flex-direction: column; gap: 8rpx; }
.team-name { font-size: 32rpx; font-weight: 600; color: #eef4ea; }
.team-code { font-size: 24rpx; color: #b8f36b; }
.leave { font-size: 26rpx; color: #ff7b72; padding: 8rpx 16rpx; }
.share-tip { display: flex; align-items: center; justify-content: space-between; margin-top: 20rpx; padding: 20rpx 24rpx; background: rgba(255, 209, 102, 0.1); border-radius: 16rpx; font-size: 24rpx; color: #ffd166; }
.share-tip.on { background: rgba(184, 243, 107, 0.1); color: #b8f36b; }
.share-on { padding: 8rpx 24rpx; background: #b8f36b; color: #0f141b; border-radius: 999rpx; font-size: 22rpx; font-weight: 600; }
.share-on.off { background: #1a2430; color: #8a97a5; }
.members { margin-top: 24rpx; flex: 1; }
.member { display: flex; align-items: center; background: #151d27; border-radius: 20rpx; padding: 24rpx; margin-bottom: 16rpx; }
.avatar { width: 72rpx; height: 72rpx; border-radius: 50%; background: #1a2430; color: #b8f36b; display: flex; align-items: center; justify-content: center; font-size: 30rpx; font-weight: 600; }
.m-info { flex: 1; margin-left: 20rpx; display: flex; flex-direction: column; gap: 6rpx; }
.m-name { font-size: 28rpx; font-weight: 600; color: #eef4ea; }
.leader, .me { margin-left: 12rpx; font-size: 18rpx; color: #0f141b; background: #b8f36b; border-radius: 8rpx; padding: 2rpx 10rpx; }
.me { background: #65c7ff; }
.m-time { font-size: 20rpx; color: #5c6a78; }
.m-dist { display: flex; flex-direction: column; align-items: flex-end; gap: 6rpx; }
.m-dist-v { font-size: 30rpx; font-weight: 700; color: #eef4ea; }
.m-go { font-size: 22rpx; color: #b8f36b; }
.empty { text-align: center; color: #5c6a78; font-size: 24rpx; padding: 48rpx 0; }
.tip { padding: 24rpx 0; font-size: 20rpx; color: #445059; text-align: center; }
</style>
