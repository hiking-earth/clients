import { hasPrivacyConsent, onPrivacyChange } from '@/services/privacy';
import type { TrackPoint } from '@shared/types/track';
// #ifdef APP-PLUS
import { startBackground, stopBackground, backgroundBuffer, acknowledgeBackground } from '@/uni_modules/hiking-background';
// #endif
let running = false;
export function backgroundSupported(): boolean {
  // #ifdef APP-PLUS
  return true;
  // #endif
  // #ifndef APP-PLUS
  return false;
  // #endif
}
export function beginBackground(session: string, changed: () => void, error: (message: string) => void): boolean {
  if (!backgroundSupported() || !hasPrivacyConsent('location') || !hasPrivacyConsent('backgroundLocation')) return false;
  // #ifdef APP-PLUS
  try { running = startBackground(session, changed, message => { running = false; error(message); }); }
  catch { running = false; error('当前安装包未包含后台定位模块，请使用前台记录'); }
  // #endif
  return running;
}
export function stopBackgroundRecording(): void {
  // #ifdef APP-PLUS
  try { stopBackground(); } catch {}
  // #endif
  running = false;
}
export function backgroundRecording(): boolean { return running; }
export function pendingBackground(): { session: string; points: TrackPoint[] } {
  // #ifdef APP-PLUS
  try { const value = JSON.parse(backgroundBuffer()); return { session: String(value.session || ''), points: Array.isArray(value.points) ? value.points : [] }; } catch {}
  // #endif
  return { session: '', points: [] };
}
export function acknowledgeBackgroundPoints(timestamp: number): void {
  // #ifdef APP-PLUS
  acknowledgeBackground(timestamp);
  // #endif
}
onPrivacyChange(consents => { if (!consents.location || !consents.backgroundLocation) stopBackgroundRecording(); });
