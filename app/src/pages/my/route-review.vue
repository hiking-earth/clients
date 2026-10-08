<template><scroll-view scroll-y class="page"><text class="title">官方路线资料审核</text><text>需要管理员账号。官方来源域名由服务端配置；开放状态有效期最多七天，轨迹授权另行审核。</text><input :disabled="busy" v-model="keyword" placeholder="搜索路线" /><button v-for="r in matching" :key="r.id"  :disabled="busy" @click="choose(r.id)">{{r.name}} · {{r.region}}</button><text>路线 {{routeName||'未选择'}}</text><picker :disabled="busy" :range="statuses" :value="statuses.indexOf(status)" @change="status=statuses[Number(eventValue($event))]"><button>状态：{{status}}</button></picker><input :disabled="busy" v-model="sourceUrl" placeholder="官方 HTTPS 资料链接" /><input :disabled="busy" v-model="checkedAt" placeholder="核验日期，如 2026-10-05T00:00:00+08:00" /><textarea :disabled="busy" v-model="summary" maxlength="3000" placeholder="资料摘要" /><textarea :disabled="busy" v-model="riskNotice" maxlength="3000" placeholder="风险与预约提示" /><view><text>可选：独立审核可导航轨迹。不得直接使用简化参考线、认知示意或中断路线。</text><input :disabled="busy" v-model="trackSource" placeholder="轨迹官方来源 HTTPS 链接" /><input :disabled="busy" v-model="trackLicense" placeholder="适用许可及依据（不填则不开放轨迹）" /><textarea :disabled="busy" v-model="trackJson" :maxlength="2097152" placeholder="连续完整 WGS84 点列 JSON：[[经度,纬度],...]" /><switch :disabled="busy" :checked="trackConfirmed" @change="trackConfirmed=eventValue($event)" /><text>确认已核验许可、完整轨迹及连续性</text></view><button v-if="hasExistingTrack" :disabled="busy" @click="removeTrack">明确移除已有轨迹</button><text>{{message}}</text><button :disabled="busy||!routeId" @click="save">提交审核资料</button></scroll-view></template>
<script setup lang="ts">
function eventValue(event: Event): any { return (event as Event & {detail:{value:unknown}}).detail.value; }
import {onShow,onHide,onUnload} from '@dcloudio/uni-app';import {accountSession,onAccountChange} from '@/services/account';import {ref,computed} from 'vue';import {ROUTES} from '@/services/route-catalog';import {callCloud} from '@/services/cloud';import type {RouteStatus} from '@shared/types/route';
const keyword=ref(''),routeId=ref(''),sourceUrl=ref(''),checkedAt=ref(new Date().toISOString()),summary=ref(''),riskNotice=ref(''),status=ref<RouteStatus>('待核验'),trackSource=ref(''),trackLicense=ref(''),trackJson=ref(''),trackConfirmed=ref(false),version=ref(0),message=ref(''),busy=ref(false);let selection=0,visible=false;const hasExistingTrack=ref(false);
function invalidate(){selection++;busy.value=false;routeId.value='';hasExistingTrack.value=false;trackJson.value='';trackSource.value='';trackLicense.value='';trackConfirmed.value=false;summary.value='';riskNotice.value='';sourceUrl.value='';message.value='';}
const offAccount=onAccountChange(invalidate);onShow(()=>{visible=true;});onHide(()=>{visible=false;invalidate();});onUnload(()=>{visible=false;invalidate();offAccount();});
function context(){const session=accountSession();return {selection,token:session?.token,route:routeId.value};}
function current(ctx:ReturnType<typeof context>){return visible&&selection===ctx.selection&&accountSession()?.token===ctx.token&&routeId.value===ctx.route;}
function removeTrack(){if(busy.value)return;hasExistingTrack.value=false;trackConfirmed.value=false;trackSource.value='';trackLicense.value='';trackJson.value='';message.value='本次保存将移除已有轨迹';}
const statuses:RouteStatus[]=['待核验','开放中','即将开放','临时关闭','永久关闭'];const matching=computed(()=>keyword.value?ROUTES.filter(r=>`${r.name} ${r.region}`.includes(keyword.value)).slice(0,10):[]);const routeName=computed(()=>ROUTES.find(r=>r.id===routeId.value)?.name);
async function choose(id:string){
 if(busy.value)return;invalidate();routeId.value=id;keyword.value='';version.value=0;checkedAt.value=new Date().toISOString();const ctx=context();
 const route=ROUTES.find(r=>r.id===id);summary.value=route?.summary||'';riskNotice.value=route?.archive.riskNotice||'';sourceUrl.value=route?.archive.source.url||'';status.value='待核验';busy.value=true;
 try{const result=await callCloud<{items:any[];hasMore:boolean}>('route-manage',{action:'list',routeId:id});if(!current(ctx))return;
  if(!result.ok||!result.data)throw new Error(result.errMsg||'读取审核版本失败');
  if(!Array.isArray(result.data.items)||result.data.items.length>1||result.data.hasMore!==false)throw new Error('审核资料格式无效');
  const prior=result.data.items[0];if(!prior)return;
  if(prior.routeId!==id||!Number.isInteger(prior.version)||prior.version<1||!statuses.includes(prior.status)||typeof prior.sourceUrl!=='string'||typeof prior.summary!=='string'||typeof prior.riskNotice!=='string'||!Number.isFinite(Date.parse(prior.checkedAt)))throw new Error('审核资料格式无效');
  version.value=prior.version;sourceUrl.value=prior.sourceUrl;summary.value=prior.summary;riskNotice.value=prior.riskNotice;status.value=prior.status;checkedAt.value=prior.checkedAt;
  if(prior.track){if(typeof prior.track.sourceUrl!=='string'||typeof prior.track.license!=='string'||!Array.isArray(prior.track.path))throw new Error('轨迹资料格式无效');hasExistingTrack.value=true;trackSource.value=prior.track.sourceUrl;trackLicense.value=prior.track.license;trackJson.value=JSON.stringify(prior.track.path);message.value='已有轨迹：保存前请核验并勾选连续性确认，或明确移除轨迹。';}
 }catch(e){if(current(ctx)){routeId.value='';message.value=e instanceof Error?e.message:'读取失败';}}finally{if(selection===ctx.selection)busy.value=false;}
}
async function save(){
 if(busy.value||!routeId.value)return;
 if(hasExistingTrack.value&&!trackConfirmed.value){message.value='请确认已有轨迹许可和连续性，或明确移除轨迹';return;}
 const ctx=context();const priorVersion=version.value;
 busy.value=true;message.value='';
 try{const track=trackConfirmed.value?{sourceUrl:trackSource.value,license:trackLicense.value,path:JSON.parse(trackJson.value),continuityConfirmed:true}:null;
  const result=await callCloud<{saved:boolean;version:number}>('route-manage',{action:'save',track,routeId:ctx.route,sourceUrl:sourceUrl.value,checkedAt:checkedAt.value,status:status.value,summary:summary.value,riskNotice:riskNotice.value,version:priorVersion});if(!current(ctx))return;
  if(!result.ok||result.data?.saved!==true||result.data.version!==priorVersion+1)throw new Error(result.errMsg||'保存未确认，请重新读取核对');
  version.value=result.data.version;hasExistingTrack.value=!!track;message.value='云端已确认保存；其他端刷新后获取，当前开放仍受有效期限制。';
 }catch(e){if(current(ctx))message.value=e instanceof Error?e.message:'保存失败';}finally{if(current(ctx))busy.value=false;}
}

</script><style scoped>.page{box-sizing:border-box;padding:15px;background:#0c171c;color:#edf4ef;min-height:100vh}.title{font-size:18px}text{display:block;margin:10px 0}input,textarea{padding:10px;background:#203237;margin:7.5px 0;width:100%;box-sizing:border-box}button{margin:7.5px 0}</style>
