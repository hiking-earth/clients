import { ROUTES as curated } from './routes.seed';
import { discoveryNameReview, discoveryTagHighlights, discoveryTagValue } from './discovery-tags';
import type { HikingRoute } from '../types/route';
const regions: Record<string, string> = {china:'中国检索区域','hong-kong':'香港',macao:'澳门',europe:'欧洲','north-america':'北美',japan:'日本及周边检索区域',oceania:'大洋洲','south-america':'南美',africa:'非洲','south-asia':'南亚'};
// Discovery records never gain navigation or opening permission from OSM presence.
export function catalogRoutes(data: {routes: any[], attribution?: string}): HikingRoute[] {
  return data.routes.map((raw: any) => {
    const tagSource=data.attribution?.includes('OpenStreetMap')?'OSM':data.attribution?.includes('USDA')?'USFS':data.attribution?.includes('Department of Conservation')?'DOC新西兰':'数据源';
    const restrictionValue=typeof raw.sourceTags?.hikingRestricted==='string'?raw.sourceTags.hikingRestricted.trim():'';
    const restrictionNotice=restrictionValue?` USDA Forest Service源字段“徒步限制”原值（去除首尾空格）：${restrictionValue}；含义和适用日期需查属地官方资料。`:'';
    return {
      id:raw.id,name:raw.name,region:regions[raw.region] || raw.region,status:'待核验',center:raw.center,path:raw.referencePaths?.length===1?raw.referencePaths[0]:[],
      distance:Number.isFinite(raw.sourceTags.distanceKm)?`${raw.sourceTags.distanceKm.toFixed(1)} km${raw.id.startsWith('nzdoc-')?'（DOC来源值，待核验）':'（官方资料）'}`:discoveryTagValue(raw.sourceTags,'distance',tagSource),ascent:discoveryTagValue(raw.sourceTags,'ascent',tagSource),duration:raw.id.startsWith('nzdoc-')?discoveryTagValue(raw.sourceTags,'estimatedTime','DOC新西兰'):'待核验',difficulty:discoveryTagValue(raw.sourceTags,'difficulty',tagSource),bestSeason:'待核验',bestSeasons:[],packStyle:'待核验',overnight:'待核验',surface:'待核验',trackMode:raw.referencePaths?.length===1?'认知示意':'不展示轨迹',scenery:[],
      summary:raw.id.startsWith('nzdoc-')?'新西兰环保部提供的步道近似中心线参考档案；出行前请查看DOC官网公告确认临时关闭，不能用于导航。':'自动采集的徒步路线发现档案；装备、住宿、路况与开放许可尚未核验。',image:'',imageCredit:'无配图',
      archive:{source:{label:data.attribution || '© OpenStreetMap contributors · ODbL-1.0',url:raw.sourceTags?.officialUrl || raw.sourceUrl},checkedAt:`采集 ${raw.fetchedAt}；开放状态未核验`,highlights:[...discoveryNameReview(raw.name),...discoveryTagHighlights(raw.sourceTags,tagSource)],riskNotice:`地图收录不代表允许通行。来源标签为贡献者或来源提供方原始标注，不代表官方公告、当前许可或安全结论；出发前核验属地公告和预约。本档案不提供导航。${raw.id.startsWith('nzdoc-')?'新西兰环保部标注该几何为近似中心线，并明确应在步行前向当地办公室或DOC官网核实闭合状态。':''}${restrictionNotice}`}
    };
  });
}
// Large public catalogs are fetched through the paginated catalog service so
// they do not inflate every app/mini-program bundle. Keep only curated seeds
// in the package; clients retain their last successful catalog in local storage.
export const ROUTES: HikingRoute[] = [...curated];
export const CATALOG_INFO = { updatedAt:null, attribution:'通过公共目录服务按需同步', licenseUrl:'https://www.openstreetmap.org/copyright' };
