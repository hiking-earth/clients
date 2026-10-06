<template>
  <scroll-view scroll-y class="page">
    <button @click="go('/pages/guide/manage')">导购资料管理（管理员）</button>
    <button @click="go('/pages/my/route-review')">官方路线审核（管理员）</button>
    <button @click="go('/pages/route/news')">官方户外公告</button>
    <button @click="go('/pages/my/import')">迁移旧网页日记与留言</button>
    <!-- 账号 -->
    <view class="account">
      <view class="avatar">{{ nickname.slice(0, 1) }}</view>
      <view class="acc-info">
        <text class="nick">{{ nickname }}</text>
        <text class="acc-sub">{{ openid ? '已登录，可使用云端功能' : '登录后可用云同步、组队与社区' }}</text>
      </view>
      <button v-if="!openid" class="login" @click="login">登录</button>
    </view>

    <!-- 功能入口 -->
    <view class="group"><view class="row" @click="go('/pages/companion/social')"><text class="row-icon">✎</text><text class="row-name">云端日记、队聊与通知</text><text class="row-go">›</text></view></view>
    <view class="group"><view class="row" @click="go('/pages/library/library')"><text class="row-icon">♡</text><text class="row-name">收藏与行程</text><text class="row-go">›</text></view></view>
    <view class="group">
      <view class="row" @click="go('/pages/account/account')"><text class="row-icon">👤</text><text class="row-name">统一账号与账号管理</text><text class="row-go">›</text></view>
      <view class="row" @click="go('/pages/team/team')">
        <text class="row-icon">👥</text><text class="row-name">组队会合</text><text class="row-go">›</text>
      </view>
      <view class="row" @click="go('/pages/gear/scan')">
        <text class="row-icon">📷</text><text class="row-name">拍照识装备</text><text class="row-go">›</text>
      </view>
      <view class="row" @click="go('/pages/guide/guide')">
        <text class="row-icon">🎒</text><text class="row-name">装备导购</text><text class="row-go">›</text>
      </view>
    </view>

    <view class="group">
      <view class="row" @click="syncAll">
        <text class="row-icon">☁️</text><text class="row-name">云同步全部轨迹</text>
        <text class="row-sub">{{ unsynced }} 条待同步</text><text class="row-go">›</text>
      </view>
      <view class="row" @click="go('/pages/track/cloud')"><text class="row-icon">☁️</text><text class="row-name">恢复与管理云端轨迹</text><text class="row-go">›</text></view>
      <view class="row" @click="go('/pages/offline/offline')">
        <text class="row-icon">🗺️</text><text class="row-name">离线资料管理</text><text class="row-sub">本机轨迹</text><text class="row-go">›</text>
      </view>
    </view>

    <view class="group"><view class="row" @click="go('/pages/my/updates')"><text class="row-icon">↻</text><text class="row-name">自动同步与版本更新</text><text class="row-go">›</text></view></view>
    <view class="group">
      <view class="row" @click="go('/pages/my/privacy')">
        <text class="row-icon">🔒</text><text class="row-name">隐私设置</text><text class="row-go">›</text>
      </view>
      <view class="row" @click="about">
        <text class="row-icon">ℹ️</text><text class="row-name">关于徒步地球</text><text class="row-go">›</text>
      </view>
    </view>

    <view class="ver">徒步地球客户端 v0.2.0 · 全端客户端</view>
  </scroll-view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { callCloud } from "@/services/cloud";
import { listTracks, uploadTrackToCloud } from "@/services/tracks";
import { hasPrivacyConsent } from "@/services/privacy";
import { accountSession } from '@/services/account';

const openid = ref("");
const nickname = ref("未登录");
const unsynced = ref(0);
let syncingTracks=false;

onShow(() => {
  unsynced.value = listTracks().filter((t) => !t.synced).length;
  const session = accountSession();
  const saved = uni.getStorageSync("he_openid");
  openid.value = ''; nickname.value = '未登录';
  if (session) { openid.value = session.openid; nickname.value = session.nickname; }
  // #ifdef MP-WEIXIN
  else if (saved && saved !== "local-mock-user" && !String(saved).startsWith("account:")) {
    openid.value = saved;
    nickname.value = "山友";
  }
  // #endif
});

async function login() {
  // #ifndef MP-WEIXIN
  go('/pages/account/account'); return;
  // #endif
  const res = await callCloud<{ openid: string; nickname: string }>("login");
  const loginData = res.data;
  if (res.ok && loginData) {
    openid.value = loginData!.openid;
    nickname.value = loginData!.nickname ?? "山友";
    uni.setStorageSync("he_openid", loginData!.openid);
    uni.showToast({ title: "登录成功", icon: "success" });
  } else {
    uni.showToast({ title: res.errMsg ?? "登录失败", icon: "none" });
  }
}

async function syncAll() {
  if(syncingTracks)return;
  if (!hasPrivacyConsent("trackCloudSync")) {
    uni.showModal({
      title: "需要轨迹备份授权",
      content: "手动备份或已另行开启的账号自动同步，都需要先在隐私设置中启用云端轨迹备份。",
      showCancel: false,
    });
    return;
  }
  const list = listTracks().filter((t) => !t.synced);
  if (list.length === 0) {
    uni.showToast({ title: "没有待同步轨迹", icon: "none" });
    return;
  }
  syncingTracks=true;
  uni.showLoading({ title: "同步中" });
  const owner=String(uni.getStorageSync("he_openid")||"");
  let okCount = 0,attempted=0,interrupted=false;
  try { for (const t of list) {
    if(owner!==String(uni.getStorageSync("he_openid")||"")||!hasPrivacyConsent("trackCloudSync")){interrupted=true;break;}
    attempted++;
    if(await uploadTrackToCloud(t))okCount++;
    if(owner!==String(uni.getStorageSync("he_openid")||"")||!hasPrivacyConsent("trackCloudSync")){interrupted=true;break;}
  }} finally { syncingTracks=false;uni.hideLoading(); }
  unsynced.value = listTracks().filter((t) => !t.synced).length;
  uni.showToast({ title: interrupted?`已确认 ${okCount} 条；因账号或授权变化停止，${unsynced.value} 条仍待同步`:`已确认 ${okCount}/${attempted} 条；${unsynced.value} 条仍待同步`, icon: "none" });
}

function go(url: string) {
  uni.navigateTo({ url });
}

function offlineTip() {
  uni.showModal({ title: "离线数据", content: "已保存和导入的轨迹保存在本机，箭头导航使用设备定位。地图底图仍需要网络；当前未提供离线地形地图下载。", showCancel: false });
}

function about() {
  uni.showModal({
    title: "徒步地球",
    content: "以 3D 地球发现全球徒步路线。客户端候选版：不构成导航服务或许可，出行以属地公告为准。\\n上游：github.com/hiking-earth/hiking-earth",
    showCancel: false,
  });
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #0f141b; padding: 40rpx 32rpx; box-sizing: border-box; }
.account { display: flex; align-items: center; background: #151d27; border-radius: 20rpx; padding: 32rpx 24rpx; }
.avatar { width: 96rpx; height: 96rpx; border-radius: 50%; background: #1a2430; color: #b8f36b; display: flex; align-items: center; justify-content: center; font-size: 40rpx; font-weight: 700; }
.acc-info { flex: 1; margin-left: 24rpx; display: flex; flex-direction: column; gap: 8rpx; }
.nick { font-size: 32rpx; font-weight: 600; color: #eef4ea; }
.acc-sub { font-size: 22rpx; color: #5c6a78; }
.login { padding: 0 40rpx; height: 64rpx; line-height: 64rpx; background: #b8f36b; color: #0f141b; font-size: 26rpx; font-weight: 600; border-radius: 999rpx; }
.group { margin-top: 28rpx; background: #151d27; border-radius: 20rpx; overflow: hidden; }
.row { display: flex; align-items: center; padding: 28rpx 24rpx; border-bottom: 1rpx solid #1a2430; }
.row:last-child { border-bottom: none; }
.row-icon { font-size: 32rpx; width: 56rpx; }
.row-name { flex: 1; font-size: 28rpx; color: #eef4ea; }
.row-sub { font-size: 22rpx; color: #5c6a78; margin-right: 12rpx; }
.row-go { font-size: 32rpx; color: #5c6a78; }
.ver { margin-top: 48rpx; text-align: center; font-size: 20rpx; color: #445059; }
</style>
