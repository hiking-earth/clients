/**
 * GPS 轨迹记录数据模型（客户端自有）
 * 坐标统一存 WGS84（uni.getLocation 默认 type:'wgs84'），渲染腾讯地图时转 GCJ-02。
 */

export type TrackPoint = {
  /** 暂停或中断后的新段起点，避免跨段连线 */
  segmentStart?: boolean;
  /** 导入文件缺少时间时不将本机占位时间导出成实测数据 */
  timeEstimated?: boolean;
  /** 纬度（WGS84） */
  latitude: number;
  /** 经度（WGS84） */
  longitude: number;
  /** 海拔（米），可能不可用 */
  altitude?: number;
  /** 速度（m/s） */
  speed?: number;
  /** 定位精度（米） */
  accuracy?: number;
  /** 采样时间戳（ms） */
  timestamp: number;
};

export type TrackRecord = {
  id: string;
  /** 用户命名，默认按日期生成 */
  name: string;
  /** 关联路线 id（自由徒步则为空） */
  routeId?: string;
  points: TrackPoint[];
  /** 累计里程（米） */
  distanceM: number;
  /** 实际记录用时，不含暂停 */
  activeDurationMs?: number;
  /** 累计爬升（米） */
  ascentM: number;
  /** 累计下降（米） */
  descentM: number;
  /** 开始/结束时间戳（ms） */
  startedAt: number;
  endedAt?: number;
  /** 记录状态 */
  state: "recording" | "paused" | "finished";
  /** 是否已云同步 */
  synced: boolean;
};

/** GPX 导出的最小单元，保持与 TrackPoint 一对一 */
export function trackToGpx(track: TrackRecord): string {
  const trkpts = track.points
    .map((p, index) => {
      const time = p.timeEstimated ? "" : `<time>${new Date(p.timestamp).toISOString()}</time>`;
      const ele = p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : "";
      return `${index > 0 && p.segmentStart ? "    </trkseg>\n    <trkseg>\n" : ""}      <trkpt lat="${p.latitude.toFixed(7)}" lon="${p.longitude.toFixed(7)}">${ele}${time}</trkpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="hiking-earth-clients" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${escapeXml(track.name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
