<template>
 <view class="page"><text class="title">确认设备登录</text>
 <text class="hint">{{ message }}</text>
 <view v-if="device"><text>设备：{{ device }}</text><text class="hint">确认后，此设备将使用你的账号访问云端资料。只确认你本人刚生成的二维码。</text>
 <button :disabled="busy || completed" @click="confirm">确认登录此设备</button></view>
 <button @click="scan">扫描登录二维码</button>
 <button v-if="!accountSession()" @click="login">先登录微信账号</button>
 </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { accountRequest, accountSession, saveAccount, type AccountSession } from '@/services/account';
import { initCloud } from '@/services/cloud';
declare const wx: any;
const challenge=ref(''),device=ref(''),message=ref('打开网页或桌面的登录二维码，然后在这里扫描。'),busy=ref(false),completed=ref(false);
onLoad(options=>{if(typeof options?.challenge==='string'&&/^[a-f0-9]{64}$/.test(options.challenge)){challenge.value=options.challenge;void inspect();}});
async function inspect(){device.value='';completed.value=false;if(!accountSession()){message.value='请先登录微信账号，再扫描或确认。';return;}
 const result=await accountRequest<{deviceLabel:string;status:string}>('auth.qr.inspect',{challenge:challenge.value});
 if(result.ok&&result.data?.status==='pending'){device.value=result.data.deviceLabel;message.value='请核对发起设备。';}else message.value=result.errMsg||'二维码已处理，请重新生成。';}
function scan(){
 // #ifdef MP-WEIXIN
 uni.scanCode({onlyFromCamera:true,success:r=>{const match=/^hiking-earth-login:([a-f0-9]{64})$/.exec(r.result||'');if(!match){message.value='这不是徒步地球登录二维码';return;}challenge.value=match[1];void inspect();},fail:()=>{message.value='扫描取消或失败，可重试';}});
 // #endif
 // #ifndef MP-WEIXIN
 message.value='请在微信小程序内扫描设备登录二维码';
 // #endif
}
async function login(){if(busy.value)return;busy.value=true;try{
 // #ifdef MP-WEIXIN
 initCloud();const reply=await wx.cloud.callFunction({name:'login',data:{}});
 const result=await accountRequest<AccountSession>('auth.wechat.exchange',{ticket:reply.result?.ticket});
 if(!result.ok||!result.data)throw new Error(result.errMsg||'微信登录未完成');saveAccount(result.data);if(challenge.value)await inspect();else message.value='已登录，请扫描二维码';
 // #endif
 // #ifndef MP-WEIXIN
 message.value='请在微信小程序内登录';
 // #endif
 }catch(error){message.value=error instanceof Error?error.message:'登录失败';}finally{busy.value=false;}}
async function confirm(){if(busy.value||completed.value)return;const session=accountSession();if(!session){message.value='请先登录';return;}busy.value=true;try{
 const result=await accountRequest('auth.qr.confirm',{challenge:challenge.value,confirmed:true});
 if(accountSession()?.token!==session.token){message.value='账号已改变，请重新扫描';return;}
 if(result.ok){completed.value=true;message.value='已确认，请返回网页或桌面。';}else message.value=result.errMsg||'确认未完成';
 }finally{busy.value=false;}}
</script>
<style scoped>.page{padding:24px;background:#0f141b;color:#eef4ea;min-height:100vh}.title,.hint{display:block;margin:16px 0}.title{font-size:24px}.hint{line-height:1.7;color:#b0bdca}button{margin-top:16px}</style>
