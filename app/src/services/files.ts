// #ifdef APP-PLUS
import { chooseTextFile, saveTextFile, verifyApk } from '@/uni_modules/hiking-files';
// #endif
// #ifdef H5
import { isDesktop, saveDesktopText } from '@/services/desktop';
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
    try { saveTextFile(`${safe}.gpx`, text, 'application/gpx+xml', () => resolve(true), () => resolve(false), message => reject(new Error(message))); }
    catch { reject(new Error('当前安装包未包含文件保存模块')); }
    // #endif
    // #ifndef APP-PLUS
    reject(new Error('当前平台不支持手机文件保存'));
    // #endif
  });
}

/** Save a user-confirmed local text backup without sending it to a server. */
export function saveLocalTextFile(name: string, text: string, mimeType = 'text/plain'): Promise<boolean> {
  const safe = name.replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '').slice(0, 120) || '徒步地球本地备份.txt';
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    try { saveTextFile(safe, text, mimeType, () => resolve(true), () => resolve(false), message => reject(new Error(message))); }
    catch { reject(new Error('当前安装包未包含文件保存模块')); }
    // #endif
    // #ifdef H5
    try {
      if (isDesktop()) { void saveDesktopText(safe, text).then(resolve, reject); return; }
      const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = safe; link.style.display = 'none';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); resolve(true);
    } catch { reject(new Error('浏览器未能创建本地备份文件')); }
    // #endif
    // #ifdef MP-WEIXIN
    try {
      if (text.length > 300000) { reject(new Error('备份超过小程序剪贴板安全容量；请使用App或网页端保存原始文件')); return; }
      uni.setClipboardData({ data: text, success: () => resolve(true), fail: () => reject(new Error('剪贴板无法容纳此备份；请使用App或网页端保存原始文件')) });
    } catch { reject(new Error('当前小程序无法复制完整备份；请使用App或网页端保存原始文件')); }
    // #endif
    // #ifndef APP-PLUS || H5 || MP-WEIXIN
    reject(new Error('当前平台暂不支持本地原始备份导出'));
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
