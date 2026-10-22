import { accountRequest } from './account';
export type RouteForecast = {status:'available'|'unavailable';message?:string;sourceUrl:string;provider?:string;license?:string;weather?:{temperature:string;wind:string;humidity:string;rain:string;observedAt:string}};
const CACHE_KEY='he_route_weather_v1',MAX_ENTRIES=32,TTL=10*60*1000;
function valid(value:RouteForecast):boolean{
 const weather=value?.weather,time=Date.parse(weather?.observedAt||'');
 return value?.status==='available'&&!!weather&&[weather.temperature,weather.wind,weather.humidity,weather.rain].every(v=>typeof v==='string'&&v.length<100)&&Number.isFinite(time)&&Math.abs(time-Date.now())<=3600000&&value.provider==='MET Norway'&&value.license==='CC BY 4.0'&&value.sourceUrl==='https://api.met.no/doc/TermsOfService';
}
export async function routeForecast(center:[number,number],force=false):Promise<RouteForecast>{
 const unavailable={status:'unavailable' as const,message:'天气预报暂不可用，请查属地预警。',sourceUrl:'https://api.met.no/doc/TermsOfService'};
 if(!Array.isArray(center)||center.length!==2||!center.every(Number.isFinite)||Math.abs(center[0])>180||Math.abs(center[1])>90)return unavailable;
 const key=center.join(',');let rows:any[]=[];
 try{const stored=uni.getStorageSync(CACHE_KEY);if(Array.isArray(stored)&&stored.length<=MAX_ENTRIES)rows=stored.filter(row=>row&&typeof row.key==='string'&&Number.isFinite(row.savedAt)&&row.savedAt<=Date.now()&&Date.now()-row.savedAt<TTL&&valid(row.value));}catch{}
 const cached=rows.find(row=>row.key===key);if(cached&&!force)return cached.value;
 const response=await accountRequest<RouteForecast>('weather.forecast',{latitude:center[1],longitude:center[0]});
 if(!response.ok||!response.data||!valid(response.data))return unavailable;
 try{uni.setStorageSync(CACHE_KEY,[{key,savedAt:Date.now(),value:response.data},...rows.filter(row=>row.key!==key)].slice(0,MAX_ENTRIES));}catch{}
 return response.data;
}
