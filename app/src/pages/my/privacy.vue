<template>
  <scroll-view scroll-y class="page">
    <view class="intro">
      <text class="title">隐私设置</text>
      <text class="desc">按需开启功能授权。不同账号的授权分开保存，旧版本设备通用设置不会自动授予当前账号。关闭后，应用不会通过对应功能收集或上传数据；iPhone 系统权限仍可在“设置 → 徒步地球”管理。</text>
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
      <text>装备照片仅在你主动点“开始识别”且启用“装备照片云端分析”后上传；轨迹仅在你启用“云端轨迹备份”并手动同步，或另外开启当前账号自动同步后上传。</text>
      <text>关闭“云端轨迹备份”只会停止后续上传，不会删除已备份的云端轨迹。要查看或删除云端副本，请前往“我的 → 恢复与管理云端轨迹”。</text>
      <text>不启用这些选项时，路线浏览和本地轨迹查看仍可使用。</text>
      <text>本服务由项目所有者个人运营。隐私咨询、数据删除请求与举报请联系 2308582955@qq.com；请勿发送密码或验证码。</text>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow,onUnload } from "@dcloudio/uni-app";
import { getPrivacyConsents, setPrivacyConsent, type PrivacyConsentKey, type PrivacyConsents } from "@/services/privacy";
import { onAccountChange } from '@/services/account';

const consents = ref<PrivacyConsents>(getPrivacyConsents());
const options: { key: PrivacyConsentKey; title: string; description: string }[] = [
  { key: "location", title: "导航与轨迹定位", description: "在使用导航和轨迹记录时读取当前位置；关闭后这些功能不可用。" },
  { key: "backgroundLocation", title: "原生后台轨迹记录", description: "仅手机原生端，开始记录后在锁屏或切换应用时继续读取位置。本地缓存，不自动上传；需要系统后台定位和持续通知权限。" },
  { key: "teamLocation", title: "组队位置共享", description: "仅在队伍中主动开启共享后，向队友发送当前坐标；停止共享或退出队伍后停止发送。" },
  { key: "trackCloudSync", title: "云端轨迹备份", description: "允许手动备份；另外开启账号自动同步后，可在前台自动备份已完成轨迹。关闭后停止后续上传，本机轨迹保留；已备份的云端副本需在云端轨迹管理中单独查看或删除。" },
  { key: "gearImageUpload", title: "装备照片云端分析", description: "仅在你主动开始识别时，将所选照片发送到云端视觉模型。" },
];

onShow(() => { consents.value = getPrivacyConsents(); });
const unsubscribeAccount=onAccountChange(()=>{consents.value=getPrivacyConsents();});
onUnload(unsubscribeAccount);

function toggle(key: PrivacyConsentKey, event: Event | { detail: { value: boolean } }) {
  const detail = (event as { detail?: { value?: boolean } }).detail;
  if (typeof detail?.value !== "boolean") return;
  consents.value = setPrivacyConsent(key, detail.value);
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #080d17; padding: 18px 14px 28px; box-sizing: border-box; }
.intro { display: flex; flex-direction: column; gap: 7px; padding: 4px 2px 14px; }
.title { color: #eef4ea; font-size: 21px; font-weight: 700; }
.desc { color: #a0b2b3; font-size: 12px; line-height: 1.7; }
.group { overflow: hidden; border-radius: 10px; background: #101c24; }
.item { display: flex; align-items: center; gap: 10px; padding: 14px 12px; border-bottom: 0.5px solid #1b2b32; }
.item:last-child { border-bottom: 0; }
.copy { display: flex; flex: 1; flex-direction: column; gap: 4px; }
.name { color: #eef4ea; font-size: 14px; font-weight: 600; }
.detail { color: #a0b2b3; font-size: 11px; line-height: 1.6; }
.footnote { display: flex; flex-direction: column; gap: 7px; margin-top: 14px; padding: 13px 12px; border-radius: 10px; background: #101c24; color: #a0b2b3; font-size: 11px; line-height: 1.7; }
.foot-title { color: #48c9a8; font-size: 12.5px; font-weight: 600; }
</style>
