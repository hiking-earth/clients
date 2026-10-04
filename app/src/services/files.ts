// #ifdef APP-PLUS
import { chooseTextFile, saveTextFile, verifyApk } from '@/uni_modules/hiking-files';
// #endif
export function chooseNativeText(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    try { chooseTextFile(resolve, () => resolve(null), message => reject(new Error(message))); }
    catch { reject(new Error('当前安装包未包含文件选择模块')); }
    // #endif
    // #ifndef APP-PLUS
    reject(new Error('当前平台不支持手机文件选择'));
    // #endif
  });
}

export function saveNativeGpx(name: string, text: string): Promise<boolean> {
  const safe = name.replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '').slice(0, 80) || '徒步轨迹';
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    try { saveTextFile(`${safe}.gpx`, text, () => resolve(true), () => resolve(false), message => reject(new Error(message))); }
    catch { reject(new Error('当前安装包未包含文件保存模块')); }
    // #endif
    // #ifndef APP-PLUS
    reject(new Error('当前平台不支持手机文件保存'));
    // #endif
  });
}

export async function verifyDownloadedApk(path: string, hash: string, size: number): Promise<void> {
  // #ifdef APP-PLUS
  if(plus.os.name!=='Android')throw new Error('仅Android支持APK更新');
  const local=plus.io.convertLocalFileSystemURL(path);
  if(!verifyApk(local,hash,size))throw new Error('安装包大小或SHA-256校验未通过，已取消安装');
  return;
  // #endif
  // #ifndef APP-PLUS
  throw new Error('当前平台不支持APK安装');
  // #endif
}
