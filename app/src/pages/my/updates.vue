<template>
  <scroll-view scroll-y class="page">
    <view class="card"><text class="title">自动同步</text><text>收藏、行程和已完成轨迹在同一账号的各端同步。默认关闭；轨迹还需开启云端轨迹备份授权。</text>
      <view class="row"><text>当前账号自动同步</text><switch :checked="enabled" @change="toggle" /></view>
      <text>后台同步暂停，回到前台后继续。不会自动申请定位或共享位置。</text>
      <text v-if="syncState.lastSuccess">上次同步：{{ new Date(syncState.lastSuccess).toLocaleString() }}</text>
      <text v-if="syncState.error" class="error">{{ syncState.error }}</text>
      <button :disabled="!enabled || syncState.running" @click="syncNow(true)">{{ syncState.running?'同步中…':'立即同步' }}</button>
      <button v-if="syncState.conflict" @click="goConflict">处理收藏与行程冲突</button>
    </view>
    <view class="card"><text class="title">版本更新</text><text>当前客户端 {{ APP_VERSION }}。启动和回到前台时自动检查，每六小时最多一次。</text>
      <text v-if="updateState.available">新版本 {{ updateState.version }} · {{ updateState.notes }}</text>
      <text v-if="updateState.message" class="error">{{ updateState.message }}</text>
      <text v-if="updateState.installing">正在准备更新 {{ updateState.progress }}%</text>
      <button :disabled="updateState.checking || updateState.installing" @click="checkForUpdate(true)">{{ updateState.checking?'检查中…':'检查版本' }}</button>
      <button v-if="updateState.available" :disabled="updateState.installing" @click="install">更新并重新打开</button>
      <text>更新前保存当前工作。Android需通过系统安装确认；iOS通过已发布的App Store或TestFlight版本更新。</text>
    </view>
  </scroll-view>
</template>
<script setup lang="ts">
import {ref} from 'vue';
import {onShow} from '@dcloudio/uni-app';
import {autoSyncEnabled,setAutoSync,syncNow,syncState} from '@/services/sync';
import {APP_VERSION,checkForUpdate,applyUpdate,updateState} from '@/services/updates';
const enabled=ref(false);
onShow(()=>{enabled.value=autoSyncEnabled();});
async function toggle(event:Event){
  if(!(event as Event & {detail:{value:boolean}}).detail.value){setAutoSync(false);enabled.value=false;return;}
  const result=await uni.showModal({title:'开启自动同步',content:'将本机收藏、行程以及已授权备份的完成轨迹同步到当前账号；其他设备可恢复。账号切换后需单独开启。'});
  if(!result.confirm){enabled.value=false;return;}
  try{setAutoSync(true);enabled.value=true;}catch(e:any){enabled.value=false;uni.showToast({title:e.message,icon:'none'});}
}
function goConflict(){uni.navigateTo({url:'/pages/library/library'});}
async function install(){const result=await uni.showModal({title:'更新客户端',content:'请先保存当前工作。确认后下载更新；系统可能要求安装或重启。'});if(result.confirm)await applyUpdate();}
</script>
<style scoped>
.page{min-height:100vh;background:#0f141b;padding:24rpx;box-sizing:border-box;color:#eef4ea}.card{background:#1a2430;border-radius:20rpx;padding:28rpx;margin-bottom:24rpx;display:flex;flex-direction:column;gap:20rpx}.title{font-size:36rpx;font-weight:700}.row{display:flex;align-items:center;justify-content:space-between}.error{color:#ffd166}button{background:#b8f36b;color:#10151c}
</style>
