import {reactive} from 'vue';
import snapshot from '@shared/data/content/official-news.json';
export type OfficialNews={id:string;title:string;url:string;region:string;sourceLabel:string;sourceUrl:string;publishedAt:string|null;fetchedAt:string};
const KEY='he_official_news_v1';
export const news=reactive({items:snapshot.items as OfficialNews[],generatedAt:snapshot.generatedAt as string|null,error:'',loading:false});
const valid=(r:any):r is OfficialNews=>!!r&&typeof r.id==='string'&&typeof r.title==='string'&&r.title.length<=300&&/^https:\/\/www\.nps\.gov\//.test(r.url)&&typeof r.sourceLabel==='string'&&Number.isFinite(Date.parse(r.fetchedAt))&&(r.publishedAt===null||Number.isFinite(Date.parse(r.publishedAt)));
function apply(data:any){if(data?.schemaVersion!==1||!Array.isArray(data.items)||data.items.length>500||!data.items.every(valid)||!Number.isFinite(Date.parse(data.generatedAt)))return false;news.items=data.items;news.generatedAt=data.generatedAt;return true;}
try{apply(uni.getStorageSync(KEY));}catch{}
let last=0;
export async function refreshNews():Promise<void>{if(news.loading||Date.now()-last<60*60*1000)return;news.loading=true;news.error='';try{const data=await new Promise((resolve,reject)=>uni.request({url:'https://raw.githubusercontent.com/hiking-earth/clients/main/shared/data/content/official-news.json',timeout:15000,success:r=>r.statusCode===200?resolve(r.data):reject(new Error('公告更新暂不可用')),fail:()=>reject(new Error('无法更新，保留本机公告'))}));if(!apply(data))throw new Error('公告格式无效，保留本机资料');last=Date.now();try{uni.setStorageSync(KEY,data);}catch{}}catch(e:any){news.error=e.message;}finally{news.loading=false;}}
