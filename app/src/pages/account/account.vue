<template>
  <scroll-view scroll-y class="page">
    <text class="title">{{ session ? '账号管理' : '徒步地球账号' }}</text>
    <text class="intro">同一账号可在手机、网页和桌面使用云端轨迹、组队与社区。</text>
    <!-- #ifdef H5 -->
    <view v-if="!session" class="card">
      <text class="subtitle">微信扫码登录</text>
      <image v-if="qrImage" :src="qrImage" style="width:280px;height:280px" />
      <text class="hint">在徒步地球微信小程序中打开“扫码登录网页或桌面”，扫描后确认。二维码3分钟有效。</text>
      <button :disabled="qrStarting" @click="startQr">{{ qrStarting ? '正在生成…' : '生成 / 刷新登录二维码' }}</button>
      <button v-if="qrImage" @click="stopQr()">取消扫码登录</button>
    </view>
    <!-- #endif -->
    <view v-if="!session" class="card">
      <!-- #ifdef MP-WEIXIN -->
      <view class="wechat-login">
        <text class="subtitle">微信一键登录</text>
        <text class="hint">使用本小程序的微信身份创建或登录徒步地球账号，可用于网页和桌面扫码。首次微信登录会创建微信账号；现有账号不会自动合并，请继续使用原登录方式。</text>
        <button class="primary" :disabled="busy" @click="loginWithWeChat">{{ busy ? '正在确认微信身份…' : '微信一键登录' }}</button>
      </view>
      <!-- #endif -->
      <view class="tabs">
        <button v-for="item in modes" :key="item.value" :class="{ active: mode === item.value }" @click="mode = item.value">{{ item.label }}</button>
      </view>
      <input v-model="username" maxlength="32" placeholder="账号：4–32位字母或数字" />
      <input v-if="mode === 'register'" v-model="nickname" maxlength="24" placeholder="昵称" />
      <input v-if="mode === 'recover'" v-model="code" maxlength="64" placeholder="注册时保存的恢复码" />
      <input v-model="password" password maxlength="128" :placeholder="mode === 'recover' ? '新密码（至少10个字符）' : '密码（至少10个字符）'" />
      <text v-if="mode === 'register'" class="hint">注册后会提供一次性恢复码。请妥善保存，忘记密码时可用它重置密码。</text>
      <button class="primary" :disabled="busy || !configured" @click="submit">{{ busy ? '正在提交…' : modes.find(item => item.value === mode)?.label }}</button>
    </view>
    <view v-else class="card">
      <text class="subtitle">{{ session.username }}</text>
      <text class="hint">统一账号 ID（用于核对管理员归属）</text>
      <text selectable class="account-id">{{ session.openid }}</text>
      <button :disabled="busy" @click="copyAccountId">复制账号 ID</button>
      <input v-model="nickname" maxlength="24" placeholder="昵称" />
      <button :disabled="busy" @click="updateNickname">保存昵称</button>
      <button @click="openModeration">社区管理（授权管理员）</button>
      <view v-if="!wechatAccount"><text class="subtitle">修改密码</text>
      <input v-model="password" password maxlength="128" placeholder="当前密码" />
      <input v-model="newPassword" password maxlength="128" placeholder="新密码（至少10个字符）" />
      <button :disabled="busy" @click="updatePassword">更新密码并退出其他设备</button></view>
      <button :disabled="busy" @click="logout(false)">退出当前设备</button>
      <button :disabled="busy" @click="logout(true)">退出所有设备</button>
      <text class="hint">注销会删除云轨迹、约伴内容、报名和求助记录，解散你创建的队伍。本机轨迹仍保留在原身份分区；收藏与行程会移入待确认的本机备份。以后可在新账号下明确确认转存或导入。</text>
      <button :disabled="busy" @click="deleteAccount">注销账号 / 继续注销</button>
    </view>
    <view v-if="recoveryCode" class="card recovery">
      <text class="subtitle">请保存新的恢复码</text>
      <text selectable class="code">{{ recoveryCode }}</text>
      <text class="hint">仅本次显示。重置密码后，旧恢复码失效。不要把恢复码发给其他人。</text>
      <button @click="copyRecovery">复制恢复码</button>
      <button @click="recoveryCode = ''">我已保存</button>
    </view>
    <text v-if="message" class="message">{{ message }}</text>
    <text v-if="!configured" class="hint">账号服务正在接入，当前尚不能提交。</text>
    <text class="hint">微信登录后可通过小程序扫码确认，让网页和桌面使用同一账号。手机号验证码登录与微信手机号关联尚未接入，当前可使用微信扫码或账号密码登录。</text>
  </scroll-view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
import { accountApiConfigured, accountRequest, accountSession, clearAccount, clearDeletedAccountRequests, saveAccount, onAccountChange } from '@/services/account';
import { beginDeviceLogin, claimDeviceLogin, cancelDeviceLogin, type DeviceChallenge } from '@/services/qr-login';
import { exchangeMiniProgramWeChat } from '@/services/wechat-login';
import { archiveDeletedAccountLibrary } from '@/services/library';
import type { AccountSession, AccountProfile } from '@/services/account';
const modes = [{ value: 'sign-in', label: '登录' }, { value: 'register', label: '注册' }, { value: 'recover', label: '恢复密码' }] as const;
const mode = ref<string>('sign-in'), username = ref(''), nickname = ref(''), password = ref(''), code = ref(''), newPassword = ref('');
const recoveryCode = ref(''), message = ref(''), busy = ref(false), session = ref<AccountSession | null>(null);
const configured = accountApiConfigured();
const wechatAccount = computed(() => session.value?.username.startsWith('wx_') === true);
declare const wx: any;
function refreshSession(){session.value=accountSession();nickname.value=session.value?.nickname||'';}
const unsubscribeAccount=onAccountChange(()=>{refreshSession();recoveryCode.value='';password.value='';newPassword.value='';code.value='';});
onShow(refreshSession);
onUnload(()=>{unsubscribeAccount();stopQr();});
const qrImage=ref(''),qrStarting=ref(false);let qrChallenge:DeviceChallenge|null=null,qrTimer:ReturnType<typeof setTimeout>|undefined,qrGeneration=0;
function stopQr(clearMessage=true){qrGeneration++;if(qrTimer)clearTimeout(qrTimer);qrTimer=undefined;const prior=qrChallenge;qrChallenge=null;qrImage.value='';if(prior&&clearMessage)message.value='已取消扫码登录';if(prior)void cancelDeviceLogin(prior);}
async function startQr(){if(qrStarting.value)return;stopQr();const generation=qrGeneration;qrStarting.value=true;try{
 const value=await beginDeviceLogin();if(generation!==qrGeneration||accountSession()){void cancelDeviceLogin(value.challenge);return;}qrChallenge=value.challenge;qrImage.value=value.image;message.value='等待小程序扫码确认';
 const poll=async()=>{if(generation!==qrGeneration||!qrChallenge)return;try{
 if(Date.now()>=value.challenge.expiresAt)throw new Error('二维码已过期，请刷新');
 const done=await claimDeviceLogin(value.challenge,()=>generation===qrGeneration);if(generation!==qrGeneration)return;
 if(done){qrChallenge=null;qrImage.value='';refreshSession();message.value='微信扫码登录成功';return;}
 qrTimer=setTimeout(poll,2500);
 }catch(error){if(generation===qrGeneration){message.value=error instanceof Error?error.message:'扫码登录失败';stopQr(false);}}};qrTimer=setTimeout(poll,2500);
 }catch(error){message.value=error instanceof Error?error.message:'生成失败';}finally{qrStarting.value=false;}}

function sameSession(expected:AccountSession|null){const current=accountSession();return current?.openid===expected?.openid&&current?.token===expected?.token;}
async function loginWithWeChat(){
  if(busy.value)return;
  const original=accountSession();if(original){session.value=original;message.value='当前已有账号登录，请先退出后再切换微信身份';return;}
  busy.value=true;message.value='';
  try{
    const result=await exchangeMiniProgramWeChat();
    if(!sameSession(original))return;
    saveAccount(result);refreshSession();password.value='';code.value='';message.value='微信账号已登录，可在网页和桌面扫码使用';
  }catch(error){if(sameSession(original))message.value=error instanceof Error?error.message:'微信登录未完成';}
  finally{busy.value=false;}
}
async function submit() {
  if (busy.value) return;
  const original=accountSession();
  busy.value = true; message.value = '';
  try {
    const result = await accountRequest<AccountSession & { recoveryCode?: string }>(`auth.${mode.value}`, {
      username: username.value.trim(), nickname: nickname.value, password: password.value, recoveryCode: code.value.trim(),
    });
    if(!sameSession(original))return;
    if (!result.ok || !result.data) { message.value = result.errMsg || '操作未完成'; return; }
    const newRecoveryCode=result.data.recoveryCode || '';
    // Recovery codes are displayed separately, never persisted with the session.
    const { token, expiresAt, openid, nickname: displayName, username: accountName } = result.data;
    saveAccount({ token, expiresAt, openid, nickname: displayName, username: accountName });
    recoveryCode.value=newRecoveryCode;session.value = accountSession(); nickname.value = displayName;
    message.value = '已登录，可返回使用云端功能';
  } catch { message.value = '本机无法保存登录状态，请检查存储空间后重新登录'; }
  finally { busy.value = false; password.value = ''; code.value = ''; }
}
async function updateNickname() {
  if (!session.value || busy.value) return;
  const original=accountSession();if(!original)return;
  busy.value = true;
  try {
    const result = await accountRequest<AccountProfile>('auth.nickname', { nickname: nickname.value });
    if(!sameSession(original))return;
    if (result.ok && result.data) { if(result.data.openid!==original.openid)throw new Error('账号响应不一致');saveAccount({ ...original, ...result.data }); session.value = accountSession(); message.value = '昵称已更新'; }
    else message.value = result.errMsg || '更新未完成';
  } catch { if(sameSession(original))message.value = '本机保存失败'; } finally { busy.value = false; }
}
async function updatePassword() {
  if (busy.value) return;
  const original=accountSession();if(!original)return;
  busy.value = true;
  try {
    const result = await accountRequest<AccountSession>('auth.password', { password: password.value, newPassword: newPassword.value });
    if(!sameSession(original))return;
    if (result.ok && result.data) { if(result.data.openid!==original.openid)throw new Error('账号响应不一致');saveAccount(result.data); session.value = accountSession(); message.value = '密码已更新，其他设备需重新登录'; }
    else message.value = result.errMsg || '更新未完成';
  } catch { if(sameSession(original))message.value = '本机保存失败，请用新密码重新登录'; }
  finally { busy.value = false; password.value = ''; newPassword.value = ''; }
}
function logout(all: boolean) {
  const original=accountSession();if(!original)return;
  uni.showModal({ title: all ? '退出所有设备' : '退出账号', content: '保留本机轨迹，停止位置共享。', success: async choice => {
    if (!choice.confirm || busy.value || !sameSession(original)) return;
    busy.value = true;
    try {
      const result = await accountRequest(all?'auth.sign-out-all':'auth.sign-out');
      if(!sameSession(original))return;
      if (result.ok) { const cleared=clearAccount(); session.value = null; message.value = cleared?'已退出':'云端已退出，但本机登录状态或定位清理未完全确认；请重试清理并暂勿共用此设备'; }
      else message.value = result.errMsg || '退出未完成，请联网重试';
    } finally { busy.value = false; }
  } });
}
function deleteAccount() {
  const original=accountSession();if(!original)return;
  if (!wechatAccount.value && !password.value) { message.value = '请先填写当前密码'; return; }
  uni.showModal({ title: '永久注销账号', content: '云端数据删除后无法恢复。清理期间账号不能使用业务功能；完成后，本机收藏和行程转入待确认备份，轨迹仍留在原身份分区。确认开始注销？', success: async choice => {
    if (!choice.confirm || busy.value || !sameSession(original)) return;
    busy.value = true;
    try {
      let wechatTicket = '';
      if (wechatAccount.value) {
        // #ifdef MP-WEIXIN
        const reauth = await wx.cloud.callFunction({ name: 'login', data: { action: 'reauth' } });
        if (!reauth.result?.ticket) throw new Error(reauth.result?.errMsg || '微信身份确认失败');
        wechatTicket = reauth.result.ticket;
        // #endif
        // #ifndef MP-WEIXIN
        message.value = '请在微信小程序的账号管理中确认注销'; return;
        // #endif
      }
      if (!sameSession(original)) return;
      const result = await accountRequest<{ complete: boolean }>('auth.delete', { password: password.value, wechatTicket });
      if(!sameSession(original))return;
      if (!result.ok) { message.value = result.errMsg || '注销未完成，请保留登录状态重试'; return; }
      if (result.data?.complete===true) {
        const archived=archiveDeletedAccountLibrary(original.openid);
        const cleaned=clearDeletedAccountRequests(original.openid);const localCleared=clearAccount(); session.value = null; password.value = '';
        message.value=!localCleared
          ?'云端账号已注销，但本机登录状态或定位清理未完全确认；请重试清理并暂勿共用此设备'
          :archived.status==='failed'
          ?'云端账号已注销；本机收藏与行程仍保留在旧分区，待确认备份状态未完全确认（可能已有副本），请勿清理应用数据'
          :!cleaned?'账号和云数据已注销，本机待创建请求清理失败'
          :!archived.metadataCleaned?`本机收藏与行程已移入待确认备份，但旧同步元数据未能完整清理`
          :archived.status==='archived'?`账号和云数据已注销；${archived.favorites}条收藏、${archived.plans}个行程已移入待确认备份`:'账号和云数据已注销';
      }
      else if(result.data?.complete===false) message.value = '账号已进入注销，部分数据已清理。请再次点击“继续注销”完成剩余清理。';
      else message.value='注销回执格式无效，请保留登录状态重试确认';
    } catch(error) { message.value = error instanceof Error ? error.message : '注销未完成，请重试'; } finally { busy.value = false; }
  } });
}
function openModeration() { uni.navigateTo({ url: '/pages/moderation/moderation' }); }
function copyRecovery() { uni.setClipboardData({ data: recoveryCode.value }); }
function copyAccountId() {
  const current=accountSession();
  if(!current||current.openid!==session.value?.openid||current.token!==session.value?.token)return;
  uni.setClipboardData({data:current.openid,success:()=>{if(sameSession(current))message.value='账号 ID 已复制；此操作不会授予管理员权限';},fail:()=>{if(sameSession(current))message.value='复制未完成，可长按上方账号 ID 手动复制';}});
}
</script>

<style scoped>
.page{min-height:100vh;box-sizing:border-box;padding:24px 20px;background:#0f141b;color:#eef4ea}.title{display:block;font-size:24px;font-weight:700}.intro,.hint,.message{display:block;font-size:13px;line-height:1.7;margin:12px 0;color:#8a97a5}.card{margin:20px 0;padding:20px;background:#151d27;border-radius:16px}.tabs{display:flex;gap:8px}.tabs button{flex:1;padding:0;font-size:14px}.tabs .active,.primary{background:#b8f36b;color:#0f141b}.card input{height:44px;margin:14px 0;padding:0 12px;background:#202b37;border-radius:8px;color:#eef4ea}.card button{margin-top:12px;font-size:14px}.subtitle{display:block;font-size:16px;margin-top:12px}.code{display:block;word-break:break-all;font-family:monospace;margin:16px 0;color:#b8f36b}.message{color:#d8e9bb}
.account-id{display:block;word-break:break-all;font-family:monospace;font-size:13px;line-height:1.7;color:#d8e9bb}
</style>
