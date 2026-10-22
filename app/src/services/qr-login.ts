import { accountRequest, accountSession, saveAccount, type AccountSession } from './account';
// #ifdef H5
import QRCode from 'qrcode';
// #endif
export type DeviceChallenge = {challenge:string;claimSecret:string;expiresAt:number};
export async function beginDeviceLogin():Promise<{challenge:DeviceChallenge;image:string}> {
 const result=await accountRequest<DeviceChallenge>('auth.qr.start',{deviceLabel:'徒步地球网页或桌面'});
 const value=result.data;
 if(!result.ok||!value||!/^[a-f0-9]{64}$/.test(value.challenge)||!/^[a-f0-9]{64}$/.test(value.claimSecret)||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())throw new Error(result.errMsg||'登录二维码生成失败');
 let image='';
 // #ifdef H5
 image=await QRCode.toDataURL(`hiking-earth-login:${value.challenge}`,{width:280,margin:2,errorCorrectionLevel:'M'});
 // #endif
 return {challenge:value,image};
}
export async function claimDeviceLogin(value:DeviceChallenge,isCurrent:()=>boolean=()=>true):Promise<boolean> {
 if(accountSession())throw new Error('当前已登录，请先退出再扫码切换');
 const result=await accountRequest<{status:string;session?:AccountSession}>('auth.qr.claim',value);
 if(!result.ok||!result.data)throw new Error(result.errMsg||'登录确认未完成');
 if(result.data.status==='pending')return false;
 if(result.data.status!=='signed-in'||!result.data.session)throw new Error('登录回执无效');
 // Do not overwrite a session chosen while this request was in flight.
 if(!isCurrent()||accountSession())throw new Error('扫码请求已取消或账号已改变，请重新登录');
 saveAccount(result.data.session);return true;
}
export async function cancelDeviceLogin(value:DeviceChallenge){return accountRequest('auth.qr.cancel',value);}
