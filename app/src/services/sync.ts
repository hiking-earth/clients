import { reactive } from 'vue';
import { accountSession, onAccountChange } from './account';
import { onPrivacyChange, hasPrivacyConsent } from './privacy';
import { callCloud } from './cloud';
import { acquireLibraryCloudLock, currentLibraryStorageValid, readLibrary, writeLibrary, libraryVersion, setLibraryVersion, validCloudLibrary, type Library } from './library';
import { listTracks, getTrack, saveTrack, trackAutoSyncExcluded, trackStorageValid, uploadTrackToCloud } from './tracks';
import type { TrackRecord } from '@shared/types/track';
export const syncState=reactive({running:false,lastSuccess:0,error:'',conflict:false,continuing:false});
let active=true;let started=false;let timer:ReturnType<typeof setInterval>|undefined;let lastAttempt=0;let rerunAfterCurrent=false;
const owner=()=>accountSession()?.openid || '';
const key=()=>`he_auto_sync:${owner()}`;
export function autoSyncEnabled():boolean {return !!owner() && uni.getStorageSync(key())===true;}
export function setAutoSync(enabled:boolean):void {if(!owner())throw new Error('请先登录统一账号');uni.setStorageSync(key(),enabled);if(enabled)void syncNow(true);else syncState.continuing=false;}
function allowed(identity:string):boolean {return active && owner()===identity && autoSyncEnabled();}
export async function syncNow(force=false):Promise<void> {
  const identity=owner();if(syncState.running){if(force)rerunAfterCurrent=true;return;}if(!allowed(identity) || (!force && Date.now()-lastAttempt<60000))return;
  lastAttempt=Date.now();syncState.running=true;syncState.error='';syncState.conflict=false;syncState.continuing=false;
  let releaseLibraryCloud: (() => void) | undefined;
  try {
    const savedCursor=uni.getStorageSync(`he_auto_sync_cursor:${identity}`);
    syncState.continuing=hasPrivacyConsent('trackCloudSync')&&typeof savedCursor==='string'&&savedCursor.length>0&&savedCursor.length<=128;
    if(!currentLibraryStorageValid())throw new Error('本机收藏或行程资料格式异常，自动同步已停止以免上传不完整资料；请保留应用数据，待统一修复后处理');
    releaseLibraryCloud=await acquireLibraryCloudLock();
    if(!allowed(identity))return;
    if(!currentLibraryStorageValid())throw new Error('本机收藏或行程资料格式异常，自动同步已停止以免上传不完整资料；请保留应用数据，待统一修复后处理');
    const remote=await callCloud<Library & {version:number}>('library-manage',{action:'get'});
    if(!allowed(identity))return;
    if(!remote.ok || !remote.data)throw new Error(remote.errMsg || '读取云资料失败');
    if(!validCloudLibrary(remote.data))throw new Error('云端收藏或行程格式无效，本机资料未覆盖');
    // Storage can change while the cloud read is pending (for example, another
    // page or a platform callback writes the same key). Revalidate before the
    // permissive reader is allowed to produce a sync snapshot.
    if(!currentLibraryStorageValid())throw new Error('本机收藏或行程资料格式异常，自动同步已停止以免上传不完整资料；请保留应用数据，待统一修复后处理');
    const local=readLibrary();const localSnapshot=JSON.stringify(local);const baseline=uni.getStorageSync(`he_library_baseline:${identity}`);
    const localVersion=libraryVersion();
    if(!Number.isSafeInteger(localVersion)||localVersion<0){syncState.conflict=true;throw new Error('本机云资料版本异常，自动同步已停止以避免覆盖；请先核对当前账号的云端资料');}
    let baselineValid=false;
    if(typeof baseline==='string'&&baseline){try{const parsed=JSON.parse(baseline);baselineValid=validCloudLibrary({...parsed,version:0})&&JSON.stringify({favorites:parsed.favorites,plans:parsed.plans})===baseline;}catch{}}
    const remoteLibrary={favorites:remote.data.favorites,plans:remote.data.plans};
    const remoteSnapshot=JSON.stringify(remoteLibrary);
    if(remote.data.version<localVersion){syncState.conflict=true;throw new Error('云端资料版本低于本机已确认版本，未覆盖本机资料；请先核对云端资料');}
    if(baselineValid&&remote.data.version===localVersion&&remoteSnapshot!==baseline){syncState.conflict=true;throw new Error('云端资料内容在版本号未变化时发生变化，自动同步已停止以避免覆盖');}
    let changed:boolean;
    if(baselineValid){changed=localSnapshot!==baseline;}
    else if(local.favorites.length===0&&local.plans.length===0){changed=false;}
    else if(localSnapshot===remoteSnapshot){
      // A missing baseline is recoverable only when both copies are identical.
      uni.setStorageSync(`he_library_baseline:${identity}`,localSnapshot);changed=false;
    }else if(remote.data.version===0&&remote.data.favorites.length===0&&remote.data.plans.length===0){changed=true;}
    else {syncState.conflict=true;throw new Error('本机与云端均有收藏或行程，但缺少可核对的同步基线；为避免覆盖数据，请到收藏与行程页面手动对比后保存或恢复');}
    if(changed && remote.data.version!==localVersion){syncState.conflict=true;throw new Error('收藏或行程在另一端有修改，请到收藏与行程页面处理；本机资料未覆盖');}
    if(changed){
      const result=await callCloud<{version:number}>('library-manage',{action:'save',...local,version:localVersion});
      if(!allowed(identity))return;
      if(!result.ok || !result.data)throw new Error(result.errMsg || '保存资料失败');
      if(!Number.isSafeInteger(result.data.version)||result.data.version!==remote.data.version+1)throw new Error('云端资料版本响应无效，请重新同步');
      // Do not mark edits made during the request as synchronized.
      uni.setStorageSync(`he_library_version:${identity}`,result.data.version);
      uni.setStorageSync(`he_library_baseline:${identity}`,JSON.stringify(local));
    }else if(remote.data.version!==libraryVersion() || !baselineValid){
      if(JSON.stringify(readLibrary())!==JSON.stringify(local))throw new Error('本机资料刚刚改变，将在下一轮同步');
      writeLibrary({favorites:remote.data.favorites,plans:remote.data.plans});setLibraryVersion(remote.data.version);
    }
    releaseLibraryCloud();releaseLibraryCloud=undefined;
    if(hasPrivacyConsent('trackCloudSync')) {
      if(!trackStorageValid())throw new Error('本机轨迹资料格式异常，云端轨迹同步已停止以保留原始记录；请勿清理应用数据');
      for(const track of listTracks().filter(t=>t.state==='finished'&&!t.synced&&t.localOwner===identity&&(!t.cloudOwner||t.cloudOwner===identity)&&!trackAutoSyncExcluded(t.id)).slice(0,10)){
        if(!allowed(identity)||!hasPrivacyConsent('trackCloudSync'))return;
        const uploaded=await uploadTrackToCloud(track);if(!uploaded.ok)throw new Error(uploaded.errMsg);
      }
      let cursor=typeof savedCursor==='string'&&savedCursor.length<=128?savedCursor:'';
      for(let batch=0;batch<5;batch++){
        const listing=await callCloud<{tracks:{trackId:string;version:number}[];hasMore:boolean;nextCursor:string|null}>('track-manage',{action:'list',afterCursor:cursor});
        if(!allowed(identity)||!hasPrivacyConsent('trackCloudSync'))return;
        if(!listing.ok || !listing.data)throw new Error(listing.errMsg || '读取云轨迹失败');
        if(!Array.isArray(listing.data.tracks)||listing.data.tracks.length>20||typeof listing.data.hasMore!=='boolean'
          ||!listing.data.tracks.every(item=>item&&typeof item.trackId==='string'&&item.trackId.length>0&&item.trackId.length<=128&&Number.isSafeInteger(item.version)&&item.version>=0)
          ||new Set(listing.data.tracks.map(item=>item.trackId)).size!==listing.data.tracks.length
          ||(listing.data.nextCursor!==null&&(typeof listing.data.nextCursor!=='string'||listing.data.nextCursor.length===0||listing.data.nextCursor.length>128||listing.data.nextCursor<=cursor))
          ||(listing.data.hasMore&&typeof listing.data.nextCursor!=='string')
          ||(listing.data.tracks.length>0&&typeof listing.data.nextCursor!=='string'))throw new Error('云端轨迹目录格式无效');
        for(const item of listing.data.tracks){
          if(trackAutoSyncExcluded(item.trackId))continue;
          const baseline=getTrack(item.trackId);
          if(baseline?.synced&&!baseline.cloudOwner)throw new Error(`轨迹 ${item.trackId} 的旧云端归属无法确认，请在云端轨迹页面核对后恢复`);
          if(baseline?.cloudOwner&&baseline.cloudOwner!==identity)throw new Error(`轨迹 ${item.trackId} 属于其他账号，请在当前账号手动恢复`);
          if(baseline&&!baseline.synced)throw new Error(`轨迹 ${item.trackId} 本机有未同步改动，请处理云端版本冲突`);
          if(baseline&&baseline.cloudVersion===item.version)continue;
          if(baseline&&baseline.cloudVersion!==undefined&&baseline.cloudVersion>item.version)
            throw new Error(`轨迹 ${item.trackId} 云端版本回退，未覆盖本机资料`);
          const fetched=await callCloud<{track:TrackRecord}>('track-manage',{action:'get',trackId:item.trackId});
          if(!allowed(identity)||!hasPrivacyConsent('trackCloudSync'))return;
          if(!fetched.ok||!fetched.data)throw new Error(fetched.errMsg || '恢复轨迹失败');
          if(!fetched.data.track||fetched.data.track.id!==item.trackId||fetched.data.track.state!=='finished'||fetched.data.track.synced!==true
            ||!Number.isSafeInteger(fetched.data.track.cloudVersion)||fetched.data.track.cloudVersion!==item.version)throw new Error('云端轨迹与请求不一致，本机资料未覆盖');
          if(JSON.stringify(getTrack(item.trackId))!==JSON.stringify(baseline))throw new Error('恢复期间本机轨迹已变化，本机资料未覆盖');
          saveTrack({...fetched.data.track,localOwner:identity,cloudOwner:identity});
        }
        cursor=listing.data.hasMore?(listing.data.nextCursor??''):'';
        uni.setStorageSync(`he_auto_sync_cursor:${identity}`,cursor);
        syncState.continuing=!!cursor;
        if(!listing.data.hasMore)break;
      }
      const needsOwnershipReview=listTracks().filter(t=>t.state==='finished'&&(t.localOwner!==identity||(t.synced&&!t.cloudOwner)));
      if(needsOwnershipReview.length)syncState.error=`有 ${needsOwnershipReview.length} 条轨迹归属不属于当前账号或未知，自动同步已跳过；请在“我的 → 云同步全部轨迹”确认是否转入当前账号`;
    }
    syncState.lastSuccess=Date.now();uni.setStorageSync(`he_auto_sync_last:${identity}`,syncState.lastSuccess);
  }catch(e:any){syncState.error=e.message || '同步失败，将在下次前台同步时重试';}finally{releaseLibraryCloud?.();syncState.running=false;if(rerunAfterCurrent){rerunAfterCurrent=false;void syncNow(true);}}
}
export function startSync():void {
  active=true;if(started)return;started=true;
  onAccountChange(()=>{syncState.error='';syncState.conflict=false;syncState.continuing=false;syncState.lastSuccess=Number(uni.getStorageSync(`he_auto_sync_last:${owner()}`)||0);void syncNow(true);});
  onPrivacyChange(()=>{if(!hasPrivacyConsent('trackCloudSync'))syncState.continuing=false;void syncNow();});
  timer=setInterval(()=>{void syncNow();},60000);void syncNow();
}
export function setSyncForeground(value:boolean):void {active=value;if(value){startSync();void syncNow();}}
