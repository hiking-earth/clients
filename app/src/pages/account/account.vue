<template>
  <scroll-view scroll-y class="page">
    <text class="title">{{ session ? '账号管理' : '徒步地球账号' }}</text>
    <text class="intro">同一账号可在手机、网页和桌面使用云端轨迹、组队与社区。</text>
    <view v-if="!session" class="card">
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
      <input v-model="nickname" maxlength="24" placeholder="昵称" />
      <button :disabled="busy" @click="updateNickname">保存昵称</button>
      <button @click="openModeration">社区管理（授权管理员）</button>
      <text class="subtitle">修改密码</text>
      <input v-model="password" password maxlength="128" placeholder="当前密码" />
      <input v-model="newPassword" password maxlength="128" placeholder="新密码（至少10个字符）" />
      <button :disabled="busy" @click="updatePassword">更新密码并退出其他设备</button>
      <button :disabled="busy" @click="logout(false)">退出当前设备</button>
      <button :disabled="busy" @click="logout(true)">退出所有设备</button>
      <text class="hint">注销会删除云轨迹、约伴内容、报名和求助记录，解散你创建的队伍。本机轨迹保留。请先在上方输入当前密码。</text>
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
    <text class="hint">小程序原有的微信账号与统一账号独立。要跨端使用同一份云数据，请在各端登录同一统一账号。</text>
  </scroll-view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
import { accountApiConfigured, accountRequest, accountSession, clearAccount, clearDeletedAccountRequests, saveAccount, onAccountChange } from '@/services/account';
import type { AccountSession, AccountProfile } from '@/services/account';
const modes = [{ value: 'sign-in', label: '登录' }, { value: 'register', label: '注册' }, { value: 'recover', label: '恢复密码' }] as const;
const mode = ref<string>('sign-in'), username = ref(''), nickname = ref(''), password = ref(''), code = ref(''), newPassword = ref('');
const recoveryCode = ref(''), message = ref(''), busy = ref(false), session = ref<AccountSession | null>(null);
const configured = accountApiConfigured();
function refreshSession(){session.value=accountSession();nickname.value=session.value?.nickname||'';}
const unsubscribeAccount=onAccountChange(()=>{refreshSession();recoveryCode.value='';password.value='';newPassword.value='';code.value='';});
onShow(refreshSession);
onUnload(unsubscribeAccount);
function sameSession(expected:AccountSession|null){const current=accountSession();return current?.openid===expected?.openid&&current?.token===expected?.token;}
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
      if (result.ok) { clearAccount(); session.value = null; message.value = '已退出'; }
      else message.value = result.errMsg || '退出未完成，请联网重试';
    } finally { busy.value = false; }
  } });
}
function deleteAccount() {
  const original=accountSession();if(!original)return;
  if (!password.value) { message.value = '请先填写当前密码'; return; }
  uni.showModal({ title: '永久注销账号', content: '云端数据无法恢复；清理期间账号不能使用业务功能。确认后开始删除。', success: async choice => {
    if (!choice.confirm || busy.value || !sameSession(original)) return;
    busy.value = true;
    try {
      const result = await accountRequest<{ complete: boolean }>('auth.delete', { password: password.value });
      if(!sameSession(original))return;
      if (!result.ok) { message.value = result.errMsg || '注销未完成，请保留登录状态重试'; return; }
      if (result.data?.complete===true) { const cleaned=clearDeletedAccountRequests(original.openid);clearAccount(); session.value = null; password.value = ''; message.value = cleaned?'账号和云数据已注销':'账号和云数据已注销，本机待创建请求清理失败'; }
      else if(result.data?.complete===false) message.value = '账号已进入注销，部分数据已清理。请再次点击“继续注销”完成剩余清理。';
      else message.value='注销回执格式无效，请保留登录状态重试确认';
    } finally { busy.value = false; }
  } });
}
function openModeration() { uni.navigateTo({ url: '/pages/moderation/moderation' }); }
function copyRecovery() { uni.setClipboardData({ data: recoveryCode.value }); }
</script>

<style scoped>
.page{min-height:100vh;box-sizing:border-box;padding:24px 20px;background:#0f141b;color:#eef4ea}.title{display:block;font-size:24px;font-weight:700}.intro,.hint,.message{display:block;font-size:13px;line-height:1.7;margin:12px 0;color:#8a97a5}.card{margin:20px 0;padding:20px;background:#151d27;border-radius:16px}.tabs{display:flex;gap:8px}.tabs button{flex:1;padding:0;font-size:14px}.tabs .active,.primary{background:#b8f36b;color:#0f141b}.card input{height:44px;margin:14px 0;padding:0 12px;background:#202b37;border-radius:8px;color:#eef4ea}.card button{margin-top:12px;font-size:14px}.subtitle{display:block;font-size:16px;margin-top:12px}.code{display:block;word-break:break-all;font-family:monospace;margin:16px 0;color:#b8f36b}.message{color:#d8e9bb}
</style>
