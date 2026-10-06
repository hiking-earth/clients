import {reactive} from 'vue';
import {publicSnapshot} from './public-data';
import snapshot from '@shared/data/content/official-news.json';
export type OfficialNews={id:string;title:string;url:string;region:string;sourceLabel:string;sourceUrl:string;publishedAt:string|null;fetchedAt:string};
const KEY='he_official_news_v1';
export const news=reactive({items:[] as OfficialNews[],generatedAt:null as string|null,error:'',loading:false});
function officialUrl(value:unknown):boolean{
  if(typeof value!=='string'||value.length>2048)return false;
  try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='www.nps.gov'&&!url.username&&!url.password&&!url.port;}catch{return false;}
}
const valid=(r:any):r is OfficialNews=>!!r&&typeof r.id==='string'&&!!r.id&&r.id.length<=160
  &&typeof r.title==='string'&&!!r.title.trim()&&r.title.length<=300&&officialUrl(r.url)&&officialUrl(r.sourceUrl)
  &&typeof r.region==='string'&&r.region.length<=100&&typeof r.sourceLabel==='string'&&r.sourceLabel.length<=200
  &&typeof r.fetchedAt==='string'&&Number.isFinite(Date.parse(r.fetchedAt))&&Date.parse(r.fetchedAt)<=Date.now()+30000
  &&(r.publishedAt===null||(typeof r.publishedAt==='string'&&Number.isFinite(Date.parse(r.publishedAt))));
function apply(data:any){
  if(data?.schemaVersion!==1||!Array.isArray(data.items)||data.items.length>500||!data.items.every(valid)
    ||new Set(data.items.map((r:OfficialNews)=>r.id)).size!==data.items.length
    ||typeof data.generatedAt!=='string'||!Number.isFinite(Date.parse(data.generatedAt))||Date.parse(data.generatedAt)>Date.now()+30000
    ||data.items.some((r:OfficialNews)=>Date.parse(r.fetchedAt)>Date.parse(data.generatedAt))
    ||(news.generatedAt!==null&&Date.parse(data.generatedAt)<Date.parse(news.generatedAt)))return false;
  news.items=data.items;news.generatedAt=data.generatedAt;return true;
}
apply(snapshot);
try{apply(uni.getStorageSync(KEY));}catch{}
let last=0;
export async function refreshNews():Promise<void>{if(news.loading||Date.now()-last<60*60*1000)return;news.loading=true;news.error='';try{const data=await publicSnapshot('news');if(!apply(data))throw new Error('公告格式无效，保留本机资料');last=Date.now();try{uni.setStorageSync(KEY,data);}catch{}}catch(e:any){news.error=e.message;}finally{news.loading=false;}}
