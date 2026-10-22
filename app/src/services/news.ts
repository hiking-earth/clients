import {reactive} from 'vue';
import {publicSnapshot} from './public-data';
import registry from '@shared/data/content/official-sources.json';
import snapshot from '@shared/data/content/official-news.json';
export type OfficialNews={sourceId:string;id:string;title:string;url:string;region:string;sourceLabel:string;sourceUrl:string;publishedAt:string|null;fetchedAt:string};
export type NewsSourceState={id:string;label:string;lastSuccess?:string;lastAttempt?:string;lastError?:string|null;lastCollectedCount?:number};
const KEY='he_official_news_v1';
export const news=reactive({items:[] as OfficialNews[],generatedAt:null as string|null,error:'',loading:false,sources:registry.sources.map(source=>({id:source.id,label:source.label})) as NewsSourceState[],retryAt:0});
function officialUrl(value:unknown,hosts:readonly string[]):boolean{
  if(typeof value!=='string'||value.length>2048)return false;
  const match=/^https:\/\/([^/?#]+)\/[^\\\s\u0000-\u001f\u007f]*$/.exec(value);return !!match&&hosts.includes(match[1]);
}
const valid=(r:any):r is OfficialNews=>!!r&&registry.sources.some(source=>source.id===r.sourceId&&source.url===r.sourceUrl&&source.label===r.sourceLabel&&source.region===r.region&&officialUrl(r.url,source.articleHosts)&&officialUrl(r.sourceUrl,source.articleHosts))&&typeof r.id==='string'&&!!r.id&&r.id.length<=160
  &&typeof r.title==='string'&&!!r.title.trim()&&r.title.length<=300
  &&typeof r.region==='string'&&r.region.length<=100&&typeof r.sourceLabel==='string'&&r.sourceLabel.length<=200
  &&typeof r.fetchedAt==='string'&&Number.isFinite(Date.parse(r.fetchedAt))&&Date.parse(r.fetchedAt)<=Date.now()+30000
  &&(r.publishedAt===null||(typeof r.publishedAt==='string'&&Number.isFinite(Date.parse(r.publishedAt))));
function apply(data:any){
  if(data?.schemaVersion!==1||!Array.isArray(data.items)||data.items.length>500||!data.items.every(valid)
    ||new Set(data.items.map((r:OfficialNews)=>r.id)).size!==data.items.length
    ||typeof data.generatedAt!=='string'||!Number.isFinite(Date.parse(data.generatedAt))||Date.parse(data.generatedAt)>Date.now()+30000
    ||data.items.some((r:OfficialNews)=>Date.parse(r.fetchedAt)>Date.parse(data.generatedAt)))return false;
  const sources=data.sources===undefined?[]:data.sources;
  if(!Array.isArray(sources)||sources.length>50||new Set(sources.map((r:any)=>r?.id)).size!==sources.length
    ||!sources.every((r:any)=>r&&registry.sources.some(source=>source.id===r.id&&source.label===r.label&&source.url===r.url)&&typeof r.id==='string'&&typeof r.label==='string'&&r.label.length<=200
      &&[r.lastSuccess,r.lastAttempt].every(v=>v===undefined||(typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=Date.now()+30000))
      &&(r.lastCollectedCount===undefined||(Number.isInteger(r.lastCollectedCount)&&r.lastCollectedCount>=0&&r.lastCollectedCount<=100))
      &&(r.lastError===undefined||r.lastError===null||typeof r.lastError==='string')))return false;
  // Validate the complete response before classifying an older server fallback.
  // Never replace newer bundled or cached records with an older snapshot.
  if(news.generatedAt!==null&&Date.parse(data.generatedAt)<Date.parse(news.generatedAt))return 'stale';
  news.sources=registry.sources.map(source=>{const state=sources.find((r:any)=>r.id===source.id);return {id:source.id,label:source.label,...(state?{lastSuccess:state.lastSuccess,lastAttempt:state.lastAttempt,lastError:state.lastError,lastCollectedCount:state.lastCollectedCount}:{})};});
  news.items=data.items;news.generatedAt=data.generatedAt;return 'applied';
}
apply(snapshot);
try{apply(uni.getStorageSync(KEY));}catch{}
let last=0,lastAttempt=0,failures=0,foreground=true,generation=0;
export function setNewsForeground(value:boolean){if(foreground!==value){foreground=value;generation++;}if(value)void refreshNews();}
export async function refreshNews(force=false):Promise<void>{
  const now=Date.now();
  if(!foreground||news.loading||now-lastAttempt<30000||(!force&&(now<news.retryAt||now-last<60*60*1000)))return;
  const epoch=generation;lastAttempt=now;news.loading=true;news.error='';
  try{
    const data=await publicSnapshot('news');
    if(!foreground||epoch!==generation)return;
    const outcome=apply(data);
    if(!outcome)throw new Error('公告格式无效，保留本机资料');
    if(outcome==='stale')throw new Error('云端公告暂未更新，已保留较新的本机资料；稍后自动重试');
    last=Date.now();failures=0;news.retryAt=0;
    try{uni.setStorageSync(KEY,data);}catch{news.error='公告已更新，本机缓存保存失败';}
  }catch(e:any){if(!foreground||epoch!==generation)return;failures++;news.retryAt=Date.now()+Math.min(6*60*60*1000,15*60*1000*2**Math.min(failures-1,5));news.error=e?.message||'公告更新失败，保留本机资料';}
  finally{news.loading=false;}
}
