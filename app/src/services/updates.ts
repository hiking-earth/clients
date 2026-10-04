import { reactive } from 'vue';
import { isDesktop, checkDesktopUpdate, installDesktopUpdate, restartDesktop } from './desktop';
import { hasRecordingDraft } from './tracks';
export const APP_VERSION='0.2.0';
export const updateState=reactive({checking:false,installing:false,available:false,version:'',notes:'',message:'',progress:0});
const MANIFEST=import.meta.env.VITE_RELEASE_MANIFEST_URL || 'https://raw.githubusercontent.com/hiking-earth/clients/main/shared/releases/stable.json';
type Artifact={url:string;sha256:string;size:number};
type Release={schemaVersion:1;ready:boolean;version:string;versionCode:number;notes:string;android:Artifact|null;ios:{url:string}|null};
let release:Release|null=null;let lastCheck=0;let miniManagerBound=false;
function newer(version:string,current:string):boolean {const a=version.split('.').map(Number),b=current.split('.').map(Number);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
function artifactUrl(url:string):boolean {return /^https:\/\/github\.com\/hiking-earth\/clients\/releases\/download\/[^/]+\/[^?#]+$/.test(url);}
function nativeVersion():string {
  // #ifdef APP-PLUS
  return plus.runtime.version || APP_VERSION;
  // #endif
  return APP_VERSION;
}
export async function checkForUpdate(force=false):Promise<void> {
  if(updateState.checking || updateState.installing || (!force && Date.now()-lastCheck<6*60*60*1000))return;
  updateState.checking=true;lastCheck=Date.now();updateState.message='';
  // Mini-program callbacks retain a downloaded update between checks.
  // #ifndef MP-WEIXIN
  release=null;updateState.available=false;updateState.version='';updateState.notes='';
  // #endif
  try {
    if(isDesktop()) {const info=await checkDesktopUpdate();updateState.available=!!info;updateState.version=info?.version||'';updateState.notes=info?.notes||'';return;}
    // #ifdef MP-WEIXIN
    if(miniManagerBound)return;miniManagerBound=true;
    const manager=uni.getUpdateManager();
    manager.onCheckForUpdate(result=>{updateState.message=result.hasUpdate?'微信正在准备更新':'当前小程序为最新版本';});
    manager.onUpdateReady(()=>{updateState.available=true;updateState.notes='微信已下载新版本，完成当前操作后可重启更新';});
    manager.onUpdateFailed(()=>{updateState.message='微信更新下载失败，请稍后重新打开';});
    return;
    // #endif
    const data=await new Promise<unknown>((resolve,reject)=>uni.request({url:MANIFEST,timeout:15000,success:r=>r.statusCode===200?resolve(r.data):reject(new Error('发布清单暂不可用')),fail:()=>reject(new Error('无法连接更新服务'))}));
    const r=data as Release;
    if(r?.schemaVersion!==1 || !/^\d+\.\d+\.\d+$/.test(r.version) || !Number.isInteger(r.versionCode) || typeof r.notes!=='string')throw new Error('发布清单无效');
    if(r.android && (!artifactUrl(r.android.url) || !/^[a-f0-9]{64}$/.test(r.android.sha256) || !Number.isSafeInteger(r.android.size) || r.android.size<=0 || r.android.size>200*1024*1024))throw new Error('安装包信息无效');
    if(r.ios && !/^https:\/\/(apps\.apple\.com|testflight\.apple\.com)\//.test(r.ios.url))throw new Error('iOS更新入口无效');
    release=r;updateState.available=r.ready && newer(r.version,nativeVersion());updateState.version=r.version;updateState.notes=r.notes;
    if(!updateState.available)updateState.message=r.ready?'当前为最新版本':'新版本仍在准备，尚未正式发布';
  } catch(e:any){updateState.message=e.message || '检查更新失败';}finally{updateState.checking=false;}
}
export async function applyUpdate():Promise<void> {
  if(updateState.installing || !updateState.available)return;
  if(hasRecordingDraft()){updateState.message='请先暂停并保存正在记录的轨迹，再更新';return;}
  updateState.installing=true;updateState.message='';
  try {
    if(isDesktop()){await installDesktopUpdate(updateState.version);await restartDesktop();return;}
    // #ifdef MP-WEIXIN
    uni.getUpdateManager().applyUpdate();return;
    // #endif
    // #ifdef APP-PLUS
    if(plus.os.name==='iOS'){if(!release?.ios)throw new Error('iOS签名版本尚未发布');plus.runtime.openURL(release.ios.url);return;}
    if(!release?.android)throw new Error('Android新版安装包尚未发布');
    const artifact=release.android;
    const filename=await new Promise<string>((resolve,reject)=>{
      const task=uni.downloadFile({url:artifact.url,timeout:180000,success:r=>r.statusCode===200?resolve(r.tempFilePath):reject(new Error('安装包下载失败')),fail:()=>reject(new Error('安装包下载中断'))});
      task.onProgressUpdate(p=>{updateState.progress=p.progress;});
    });
    const { verifyDownloadedApk }=await import('./files');
    await verifyDownloadedApk(filename,artifact.sha256,artifact.size);
    // Android's installer additionally validates APK signature and upgrade identity.
    await new Promise<void>((resolve,reject)=>plus.runtime.install(filename,{force:false},()=>resolve(),()=>reject(new Error('安装未完成，请检查系统安装授权'))));
    return;
    // #endif
    // #ifdef H5
    updateState.message='网页功能随服务发布更新，请完成当前操作后重新打开页面';
    // #endif
  }catch(e:any){updateState.message=e.message || '更新未完成';}finally{updateState.installing=false;}
}
