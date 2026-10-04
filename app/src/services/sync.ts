import { reactive } from 'vue';
import { accountSession, onAccountChange } from './account';
import { onPrivacyChange, hasPrivacyConsent } from './privacy';
import { callCloud } from './cloud';
import { readLibrary, writeLibrary, libraryVersion, setLibraryVersion, type Library } from './library';
import { listTracks, markSynced, getTrack, saveTrack, trackAutoSyncExcluded } from './tracks';
import type { TrackRecord } from '@shared/types/track';
export const syncState=reactive({running:false,lastSuccess:0,error:'',conflict:false});
let active=true;let started=false;let timer:ReturnType<typeof setInterval>|undefined;let lastAttempt=0;
const owner=()=>accountSession()?.openid || '';
const key=()=>`he_auto_sync:${owner()}`;
export function autoSyncEnabled():boolean {return !!owner() && uni.getStorageSync(key())===true;}
export function setAutoSync(enabled:boolean):void {if(!owner())throw new Error('请先登录统一账号');uni.setStorageSync(key(),enabled);if(enabled)void syncNow(true);}
function allowed(identity:string):boolean {return active && owner()===identity && autoSyncEnabled();}
export async function syncNow(force=false):Promise<void> {
  const identity=owner();if(syncState.running || !allowed(identity) || (!force && Date.now()-lastAttempt<60000))return;
  lastAttempt=Date.now();syncState.running=true;syncState.error='';syncState.conflict=false;
  try {
    const remote=await callCloud<Library & {version:number}>('library-manage',{action:'get'});
    if(!allowed(identity))return;
    if(!remote.ok || !remote.data)throw new Error(remote.errMsg || '读取云资料失败');
    const local=readLibrary();const baseline=uni.getStorageSync(`he_library_baseline:${identity}`);
    const changed=baseline ? JSON.stringify(local)!==baseline : local.favorites.length>0 || local.plans.length>0;
    if(changed && remote.data.version!==libraryVersion()){syncState.conflict=true;throw new Error('收藏或行程在另一端有修改，请到收藏与行程页面处理；本机资料未覆盖');}
    if(changed){
      const result=await callCloud<{version:number}>('library-manage',{action:'save',...local,version:libraryVersion()});
      if(!allowed(identity))return;
      if(!result.ok || !result.data)throw new Error(result.errMsg || '保存资料失败');
      // Do not mark edits made during the request as synchronized.
      uni.setStorageSync(`he_library_version:${identity}`,result.data.version);
      uni.setStorageSync(`he_library_baseline:${identity}`,JSON.stringify(local));
    }else if(remote.data.version!==libraryVersion() || !baseline){
      if(JSON.stringify(readLibrary())!==JSON.stringify(local))throw new Error('本机资料刚刚改变，将在下一轮同步');
      writeLibrary({favorites:remote.data.favorites,plans:remote.data.plans});setLibraryVersion(remote.data.version);
    }
    if(hasPrivacyConsent('trackCloudSync')) {
      for(const track of listTracks().filter(t=>t.state==='finished'&&!t.synced&&!trackAutoSyncExcluded(t.id)).slice(0,10)){
        if(!allowed(identity)||!hasPrivacyConsent('trackCloudSync'))return;
        const result=await callCloud('track-sync',{track});
        if(!allowed(identity)||!hasPrivacyConsent('trackCloudSync'))return;
        if(!result.ok)throw new Error(result.errMsg || '轨迹上传失败');
        if(JSON.stringify(getTrack(track.id))===JSON.stringify(track))markSynced(track.id);
      }
      let page=Number(uni.getStorageSync(`he_auto_sync_page:${identity}`)||0);
      for(let batch=0;batch<5;batch++){
        const listing=await callCloud<{tracks:{trackId:string}[];hasMore:boolean}>('track-manage',{action:'list',page});
        if(!allowed(identity)||!hasPrivacyConsent('trackCloudSync'))return;
        if(!listing.ok || !listing.data)throw new Error(listing.errMsg || '读取云轨迹失败');
        for(const item of listing.data.tracks){
          if(getTrack(item.trackId)||trackAutoSyncExcluded(item.trackId))continue;
          const fetched=await callCloud<{track:TrackRecord}>('track-manage',{action:'get',trackId:item.trackId});
          if(!allowed(identity)||!hasPrivacyConsent('trackCloudSync'))return;
          if(!fetched.ok||!fetched.data)throw new Error(fetched.errMsg || '恢复轨迹失败');
          if(!getTrack(item.trackId))saveTrack(fetched.data.track);
        }
        page=listing.data.hasMore?page+1:0;
        uni.setStorageSync(`he_auto_sync_page:${identity}`,page);
        if(page===0)break;
      }
    }
    syncState.lastSuccess=Date.now();uni.setStorageSync(`he_auto_sync_last:${identity}`,syncState.lastSuccess);
  }catch(e:any){syncState.error=e.message || '同步失败，将在下次前台同步时重试';}finally{syncState.running=false;}
}
export function startSync():void {
  active=true;if(started)return;started=true;
  onAccountChange(()=>{syncState.error='';syncState.conflict=false;syncState.lastSuccess=Number(uni.getStorageSync(`he_auto_sync_last:${owner()}`)||0);void syncNow();});
  onPrivacyChange(()=>{void syncNow();});
  timer=setInterval(()=>{void syncNow();},60000);void syncNow();
}
export function setSyncForeground(value:boolean):void {active=value;if(value){startSync();void syncNow();}}
