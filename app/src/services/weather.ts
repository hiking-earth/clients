import { accountRequest } from './account';
export type RouteForecast = {status:'available'|'unavailable';message?:string;sourceUrl:string;provider?:string;license?:string;weather?:{temperature:string;wind:string;humidity:string;rain:string;observedAt:string}};
export async function routeForecast(center:[number,number]):Promise<RouteForecast>{
 const unavailable={status:'unavailable' as const,message:'天气预报暂不可用，请查属地预警。',sourceUrl:'https://api.met.no/doc/TermsOfService'};
 const response=await accountRequest<RouteForecast>('weather.forecast',{latitude:center[1],longitude:center[0]});
 if(!response.ok||!response.data)return unavailable;
 const value=response.data,weather=value.weather;
 if(value.status==='available'&&weather&&[weather.temperature,weather.wind,weather.humidity,weather.rain].every(v=>typeof v==='string'&&v.length<100)&&Number.isFinite(Date.parse(weather.observedAt))&&value.provider==='MET Norway'&&value.license==='CC BY 4.0')return value;
 return unavailable;
}
