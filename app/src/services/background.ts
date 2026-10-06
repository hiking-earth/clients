import { hasPrivacyConsent, onPrivacyChange } from '@/services/privacy';
import {validTrackPoint} from '@shared/types/track';
import type { TrackPoint } from '@shared/types/track';
// #ifdef APP-PLUS
import { startBackground, stopBackground, backgroundBuffer, acknowledgeBackground } from '@/uni_modules/hiking-background';
// #endif
let running = false;let generation=0;
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
  const epoch=++generation;let failed=false;
  try { const started=startBackground(session, ()=>{if(epoch===generation)changed();}, message => { if(epoch!==generation)return;failed=true;running = false; error(message); });running=epoch===generation&&started&&!failed; }
  catch { running = false; error('当前安装包未包含后台定位模块，请使用前台记录'); }
  // #endif
  return running;
}
export function stopBackgroundRecording(): void {
  generation++;
  // #ifdef APP-PLUS
  try { stopBackground(); } catch {}
  // #endif
  running = false;
}
export function backgroundRecording(): boolean { return running; }
export function pendingBackground(): { session: string; points: TrackPoint[] } {
  // #ifdef APP-PLUS
  try { const value = JSON.parse(backgroundBuffer()); return { session: String(value.session || ''), points: Array.isArray(value.points) ? value.points.filter((point:unknown)=>validTrackPoint(point)&&point.timestamp<=Date.now()+30000).sort((a:TrackPoint,b:TrackPoint)=>a.timestamp-b.timestamp).slice(0,20000) : [] }; } catch {}
  // #endif
  return { session: '', points: [] };
}
export function acknowledgeBackgroundPoints(timestamp: number): boolean {
  if(!Number.isFinite(timestamp)||timestamp<=0)return false;
  // #ifdef APP-PLUS
  try { return acknowledgeBackground(timestamp)===true; } catch { return false; }
  // #endif
  // #ifndef APP-PLUS
  return false;
  // #endif
}
onPrivacyChange(consents => { if (!consents.location || !consents.backgroundLocation) stopBackgroundRecording(); });
