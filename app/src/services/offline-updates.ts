import { reactive } from 'vue';
import { publicSnapshot } from './public-data';
import { offlineLayers, restoreOfflineLayers, importOfflineLayer } from './offline';
const KEY='he_official_offline_updates';
export const offlineUpdateState=reactive({enabled:uni.getStorageSync(KEY)===true,running:false,message:''});
let foreground=true,nextAttempt=0,failures=0;
export function setOfficialOfflineUpdates(enabled:boolean):void {
 uni.setStorageSync(KEY,enabled);offlineUpdateState.enabled=enabled;nextAttempt=0;
 if(enabled)void refreshOfficialOffline();
}
export function setOfflineUpdatesForeground(value:boolean):void{foreground=value;if(value)void refreshOfficialOffline();}
export async function refreshOfficialOffline():Promise<void>{
 if(!foreground||!offlineUpdateState.enabled||offlineUpdateState.running||Date.now()<nextAttempt)return;
 offlineUpdateState.running=true;
 try{
  await restoreOfflineLayers();
  if(!offlineLayers().some(layer=>layer.sourceKey==='hk-afcd'))return;
  const text=JSON.stringify(await publicSnapshot('offline-hk'));
  await importOfflineLayer(text,'hk-afcd',{replaceOnly:true,shouldApply:()=>foreground&&offlineUpdateState.enabled});
  failures=0;nextAttempt=Date.now()+6*60*60*1000;offlineUpdateState.message='已更新本机官方参考线';
 }catch(e){failures++;nextAttempt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(failures-1,5));offlineUpdateState.message=e instanceof Error?e.message:'更新失败，保留已保存资料';}
 finally{offlineUpdateState.running=false;}
}
