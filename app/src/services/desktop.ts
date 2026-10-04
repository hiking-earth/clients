/** Desktop bridge exists only in the bundled Tauri window. */
type DesktopWindow = Window & { __TAURI__?: { core: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> } } };
export function isDesktop(): boolean {
  // #ifdef H5
  return typeof window !== 'undefined' && !!(window as DesktopWindow).__TAURI__?.core;
  // #endif
  // #ifndef H5
  return false;
  // #endif
}
export async function chooseDesktopGpx(): Promise<string | null> {
  // #ifdef H5
  if (isDesktop()) return (window as DesktopWindow).__TAURI__!.core.invoke<string | null>('choose_gpx');
  // #endif
  throw new Error('当前平台不支持桌面文件选择');
}
export async function saveDesktopGpx(name: string, content: string): Promise<boolean> {
  // #ifdef H5
  if (isDesktop()) return (window as DesktopWindow).__TAURI__!.core.invoke<boolean>('save_gpx', { name, content });
  // #endif
  throw new Error('当前平台不支持桌面文件保存');
}
