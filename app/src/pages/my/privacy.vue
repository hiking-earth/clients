<template>
  <scroll-view scroll-y class="page">
    <view class="intro">
      <text class="title">隐私设置</text>
      <text class="desc">按需开启功能授权。关闭后，应用不会通过对应功能收集或上传数据；iPhone 系统权限仍可在“设置 → 徒步地球”管理。</text>
    </view>

    <view class="group">
      <view v-for="item in options" :key="item.key" class="item">
        <view class="copy">
          <text class="name">{{ item.title }}</text>
          <text class="detail">{{ item.description }}</text>
        </view>
        <switch :checked="consents[item.key]" color="#b8f36b" @change="toggle(item.key, $event)" />
      </view>
    </view>

    <view class="footnote">
      <text class="foot-title">系统权限说明</text>
      <text>定位只会在你启动导航、轨迹记录或主动开启组队共享时申请。iOS 的定位和相机权限可随时在系统设置中撤回。</text>
      <text>装备照片仅在你主动点“开始识别”且启用“装备照片云端分析”后上传；轨迹仅在你主动同步且启用“云端轨迹备份”后上传。</text>
      <text>不启用这些选项时，路线浏览和本地轨迹查看仍可使用。</text>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { getPrivacyConsents, setPrivacyConsent, type PrivacyConsentKey, type PrivacyConsents } from "@/services/privacy";

const consents = ref<PrivacyConsents>(getPrivacyConsents());
const options: { key: PrivacyConsentKey; title: string; description: string }[] = [
  { key: "location", title: "导航与轨迹定位", description: "在使用导航和轨迹记录时读取当前位置；关闭后这些功能不可用。" },
  { key: "backgroundLocation", title: "原生后台轨迹记录", description: "仅手机原生端，开始记录后在锁屏或切换应用时继续读取位置。本地缓存，不自动上传；需要系统后台定位和持续通知权限。" },
  { key: "teamLocation", title: "组队位置共享", description: "仅在队伍中主动开启共享后，向队友发送当前坐标；停止共享或退出队伍后停止发送。" },
  { key: "trackCloudSync", title: "云端轨迹备份", description: "仅在你手动同步时上传轨迹；关闭后轨迹保留在本机。" },
  { key: "gearImageUpload", title: "装备照片云端分析", description: "仅在你主动开始识别时，将所选照片发送到云端视觉模型。" },
];

onShow(() => { consents.value = getPrivacyConsents(); });

function toggle(key: PrivacyConsentKey, event: Event | { detail: { value: boolean } }) {
  const detail = (event as { detail?: { value?: boolean } }).detail;
  if (typeof detail?.value !== "boolean") return;
  consents.value = setPrivacyConsent(key, detail.value);
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #0f141b; padding: 36rpx 28rpx 56rpx; box-sizing: border-box; }
.intro { display: flex; flex-direction: column; gap: 14rpx; padding: 8rpx 4rpx 28rpx; }
.title { color: #eef4ea; font-size: 42rpx; font-weight: 700; }
.desc { color: #8a97a5; font-size: 24rpx; line-height: 1.7; }
.group { overflow: hidden; border-radius: 20rpx; background: #151d27; }
.item { display: flex; align-items: center; gap: 20rpx; padding: 28rpx 24rpx; border-bottom: 1rpx solid #1a2430; }
.item:last-child { border-bottom: 0; }
.copy { display: flex; flex: 1; flex-direction: column; gap: 8rpx; }
.name { color: #eef4ea; font-size: 28rpx; font-weight: 600; }
.detail { color: #8a97a5; font-size: 22rpx; line-height: 1.6; }
.footnote { display: flex; flex-direction: column; gap: 14rpx; margin-top: 28rpx; padding: 26rpx 24rpx; border-radius: 20rpx; background: #151d27; color: #8a97a5; font-size: 22rpx; line-height: 1.7; }
.foot-title { color: #b8f36b; font-size: 25rpx; font-weight: 600; }
</style>
