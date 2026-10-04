import { ROUTES as curated } from './routes.seed';
import snapshot from './catalog/osm.json';
import usfs from './catalog/usfs.json';
import type { HikingRoute } from '../types/route';
const regions: Record<string, string> = {china:'中国',europe:'欧洲','north-america':'北美',japan:'日本',oceania:'大洋洲','south-america':'南美',africa:'非洲','south-asia':'南亚'};
// Discovery records never gain navigation or opening permission from OSM presence.
export function catalogRoutes(data: {routes: any[], attribution?: string}): HikingRoute[] { return data.routes.map((raw: any) => ({
  id:raw.id,name:raw.name,region:regions[raw.region] || raw.region,status:'待核验',center:raw.center,path:[],
  distance:raw.sourceTags.distance ? `${raw.sourceTags.distance}（来源原值，单位待核验）` : '待核验',ascent:'待核验',duration:'待核验',difficulty:'待核验',bestSeason:'待核验',bestSeasons:[],packStyle:'轻装',overnight:'无过夜',surface:'未铺装',trackMode:'不展示轨迹',scenery:[],
  summary:'自动采集的徒步路线发现档案；装备、住宿、路况与开放许可尚未核验。',image:'',imageCredit:'无配图',
  archive:{source:{label:data.attribution || '© OpenStreetMap contributors · ODbL-1.0',url:raw.sourceUrl},checkedAt:`采集 ${raw.fetchedAt}；开放状态未核验`,highlights:[],riskNotice:'地图收录不代表允许通行。出发前核验官方公告、预约和属地限制；本档案不提供导航。'}
})); }
const discovered = [...catalogRoutes(snapshot), ...catalogRoutes(usfs)];
const normalize = (name: string) => name.normalize('NFKC').toLocaleLowerCase().replace(/[\s·—_-]/g, '');
const names = new Set(curated.map(r=>normalize(r.name)+':'+r.center.map(v=>v.toFixed(1)).join(',')));
export const ROUTES: HikingRoute[] = [...curated, ...discovered.filter(r => {const key=normalize(r.name)+':'+r.center.map(v=>v.toFixed(1)).join(','); if(names.has(key)) return false; names.add(key); return true;})];
export const CATALOG_INFO = { updatedAt:snapshot.generatedAt, attribution:snapshot.attribution, licenseUrl:snapshot.licenseUrl };
