/**
 * 徒步路线共享数据模型。
 * app 使用本文件；web/data/routes.ts 与 site-release/data/routes.ts 的本地模型须保持兼容。
 * 未有可追溯来源的路线状态、轨迹、装备、住宿与路况必须明确标为待核验。
 */

export type RouteStatus = "开放中" | "即将开放" | "临时关闭" | "永久关闭" | "待核验";
export type Season = "春" | "夏" | "秋" | "冬";
export type PackStyle = "轻装" | "重装" | "待核验";
export type OvernightStyle = "营地" | "住宿" | "无过夜" | "待核验";
export type SurfaceStyle = "景区成熟" | "未铺装" | "待核验";
export type TrackMode = "已核验轨迹" | "认知示意" | "不展示轨迹";

export type HikingRoute = {
  id: string;
  name: string;
  region: string;
  status: RouteStatus;
  openingExpiresAt?: number;
  /** [lng, lat]，WGS84 源数据；腾讯地图渲染前需转 GCJ-02 */
  center: [number, number];
  path: [number, number][];
  distance: string;
  ascent: string;
  duration: string;
  difficulty: string;
  bestSeason: string;
  bestSeasons: Season[];
  packStyle: PackStyle;
  overnight: OvernightStyle;
  surface: SurfaceStyle;
  trackMode?: TrackMode;
  scenery: string[];
  summary: string;
  image: string;
  imageCredit: string;
  weatherCityId?: string;
  archive: {
    source: { label: string; url?: string };
    checkedAt: string;
    highlights: string[];
    riskNotice: string;
  };
};

export const STATUS_COLORS: Record<RouteStatus, string> = {
  "开放中": "#b8f36b",
  "即将开放": "#65c7ff",
  "临时关闭": "#ff9a62",
  "永久关闭": "#ff7b72",
  "待核验": "#ffd166",
};

/** 路线是否允许进入导航（与上游规则一致：关闭/不展示轨迹的路线禁用导航） */
export function isNavigable(route: HikingRoute): boolean {
  if (route.status !== "开放中" || (!Number.isFinite(route.openingExpiresAt) || route.openingExpiresAt! <= Date.now())) return false;
  if (!route.trackMode || route.trackMode === "不展示轨迹" || route.trackMode === "认知示意") return false;
  return route.path.length >= 2;
}
