/**
 * 定位与罗盘封装（uni 标准 API，App / 小程序均可用，无需 uts 插件）
 * - 持续定位：uni.startLocationUpdate + uni.onLocationChange（WGS84）
 * - 设备航向：uni.onCompassChange（地磁 + 系统融合）
 */
import type { TrackPoint } from "@shared/types/track";
import { HeadingFilter } from "@shared/api/navigation-core";

export type LocationCallback = (p: TrackPoint) => void;
export type HeadingCallback = (deg: number) => void;

const locCallbacks = new Set<LocationCallback>();
const headingCallbacks = new Set<HeadingCallback>();
const headingFilter = new HeadingFilter(0.2);
let locationStarted = false;
let compassStarted = false;

function toTrackPoint(res: any): TrackPoint {
  return {
    latitude: res.latitude,
    longitude: res.longitude,
    altitude: res.altitude ?? res.verticalAccuracy != null ? res.altitude : undefined,
    speed: res.speed,
    accuracy: res.horizontalAccuracy ?? res.accuracy,
    timestamp: Date.now(),
  };
}

/** 开始持续定位（前台）。返回是否成功启动。 */
export function startLocationUpdates(cb: LocationCallback): Promise<boolean> {
  locCallbacks.add(cb);
  if (locationStarted) return Promise.resolve(true);
  return new Promise((resolve) => {
    uni.startLocationUpdate({
      type: "wgs84",
      success: () => {
        locationStarted = true;
        uni.onLocationChange((res: any) => {
          const p = toTrackPoint(res);
          locCallbacks.forEach((fn) => fn(p));
        });
        resolve(true);
      },
      fail: (err) => {
        console.warn("[location] startLocationUpdate 失败", err);
        // 降级：单次定位轮询
        locationStarted = true;
        const poll = () => {
          uni.getLocation({
            type: "wgs84",
            success: (res: any) => locCallbacks.forEach((fn) => fn(toTrackPoint(res))),
          });
        };
        poll();
        setInterval(poll, 3000);
        resolve(true);
      },
    });
  });
}

export function stopLocationUpdates(cb?: LocationCallback): void {
  if (cb) locCallbacks.delete(cb);
  if (locCallbacks.size === 0 && locationStarted) {
    uni.stopLocationUpdate?.({ complete: () => {} });
    uni.offLocationChange?.(() => {});
    locationStarted = false;
  }
}

/** 开始罗盘（回调为滤波后的平滑航向，0=正北） */
export function startCompass(cb: HeadingCallback): void {
  headingCallbacks.add(cb);
  if (compassStarted) return;
  compassStarted = true;
  headingFilter.reset();
  uni.onCompassChange((res: any) => {
    const smooth = headingFilter.push(res.direction);
    headingCallbacks.forEach((fn) => fn(smooth));
  });
}

export function stopCompass(cb?: HeadingCallback): void {
  if (cb) headingCallbacks.delete(cb);
  if (headingCallbacks.size === 0 && compassStarted) {
    uni.offCompassChange?.(() => {});
    compassStarted = false;
  }
}
