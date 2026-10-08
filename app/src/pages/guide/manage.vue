<template><scroll-view scroll-y class="page">
<text class="title">导购资料管理</text><text>仅已授权管理员可维护。归属确认不能代替实际使用授权。</text><text>{{error}}</text>
<button :disabled="busy" @click="load(false)">刷新条目</button><button :disabled="busy" @click="create">新建条目</button>
<view v-for="row in rows" :key="row._id" class="card"><text>{{row.title}} · {{row.legacyCategory?'需核对分类':''}} · {{row.published?'已发布':'未发布'}} · 版本{{row.version||0}}</text><button :disabled="busy" @click="edit(row)">编辑</button><button v-if="row.published" :disabled="busy" @click="unpublish(row)">撤下</button></view>
<button v-if="hasMore" :disabled="busy" @click="load(true)">加载更多</button>
<view v-if="form" class="card"><input v-model="form.id" :disabled="busy||existing" placeholder="条目ID（字母、数字、下划线或短横线）"/><input v-model="form.title" :disabled="busy" maxlength="200" placeholder="标题"/>
<picker :range="categories" :disabled="busy" @change="form.category=categories[Number($event.detail.value)]"><text>分类：{{form.category}}</text></picker>
<textarea v-model="form.summary" :disabled="busy" maxlength="2000" placeholder="商品说明"/><input v-model="form.link" :disabled="busy" maxlength="2048" placeholder="HTTPS 商品链接"/><input v-model="form.priceHint" :disabled="busy" maxlength="100" placeholder="价格说明（可留空，需有依据）"/>
<input v-model="form.sourceUrl" :disabled="busy" maxlength="2048" placeholder="HTTPS 归属来源"/><textarea v-model="form.rightsNote" :disabled="busy" maxlength="1000" placeholder="链接使用权及来源说明"/>
<text>已确认真实使用授权 <switch :checked="form.rightsConfirmed" :disabled="busy" @change="setSwitch('rightsConfirmed', $event)"/></text>
<text>公开发布 <switch :checked="form.published" :disabled="busy" @change="setSwitch('published', $event)"/></text>
<button :disabled="busy" @click="save">保存{{form.published?'并发布':'为未发布'}}</button><button :disabled="busy" @click="form=null">取消编辑</button></view>
</scroll-view></template>
<script setup lang="ts">
import {ref} from 'vue';
import {onShow,onHide,onUnload} from '@dcloudio/uni-app';
import {accountSession,onAccountChange} from '@/services/account';
import {callCloud} from '@/services/cloud';
type Form={id:string;title:string;summary:string;category:string;link:string;priceHint:string;sourceUrl:string;rightsNote:string;rightsConfirmed:boolean;published:boolean;version:number};
type Row=Omit<Form,'id'>&{_id:string;legacyCategory:boolean};
const categories=['鞋靴','背包','服装','露营','导航','应急','其他'];
const rows=ref<Row[]>([]),form=ref<Form|null>(null),busy=ref(false),error=ref(''),hasMore=ref(false),existing=ref(false);
let page=0,epoch=0,visible=false;
function invalidate(){epoch++;busy.value=false;rows.value=[];form.value=null;hasMore.value=false;page=0;}
const unsubscribe=onAccountChange(()=>{invalidate();if(visible)void load(false);});
onShow(()=>{visible=true;void load(false);});onHide(()=>{visible=false;invalidate();});onUnload(()=>{visible=false;invalidate();unsubscribe();});
function context(){const session=accountSession();return session?{epoch,token:session.token,owner:session.openid}:null;}
function current(ctx:NonNullable<ReturnType<typeof context>>){const session=accountSession();return visible&&epoch===ctx.epoch&&session?.token===ctx.token&&session.openid===ctx.owner;}
function valid(row:Row){return !!row&&typeof row._id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(row._id)&&typeof row.title==='string'&&row.title.length<=200&&typeof row.summary==='string'&&row.summary.length<=2000&&categories.includes(row.category)&&typeof row.link==='string'&&typeof row.priceHint==='string'&&typeof row.sourceUrl==='string'&&typeof row.rightsNote==='string'&&typeof row.published==='boolean'&&typeof row.rightsConfirmed==='boolean'&&Number.isInteger(row.version)&&row.version>=0;}
async function load(more:boolean){
 if(busy.value)return;const ctx=context();if(!ctx){error.value='请先登录管理员账号';return;}
 busy.value=true;error.value='';const target=more?page+1:0;
 try{const res=await callCloud<{items:Row[];hasMore:boolean}>('social-manage',{action:'guides.list',page:target});if(!current(ctx))return;
  if(!res.ok||!res.data)throw new Error(res.errMsg||'加载失败');
  const data=res.data;if(!Array.isArray(data.items)||data.items.length>20||!data.items.every(valid)||typeof data.hasMore!=='boolean'||new Set(data.items.map(row=>row._id)).size!==data.items.length)throw new Error('管理资料格式无效');
  if(more&&data.items.some(row=>rows.value.some(old=>old._id===row._id)))throw new Error('列表已变化，请刷新');
  rows.value=more?[...rows.value,...data.items]:data.items;hasMore.value=data.hasMore;page=target;
 }catch(e){if(current(ctx))error.value=e instanceof Error?e.message:'加载失败';}finally{if(current(ctx))busy.value=false;}
}
function setSwitch(key:'rightsConfirmed'|'published',event:Event|{detail:{value:boolean}}){const value=(event as {detail?:{value?:boolean}}).detail?.value;if(form.value&&typeof value==='boolean')form.value[key]=value;}
function create(){if(busy.value)return;existing.value=false;form.value={id:'',title:'',summary:'',category:'其他',link:'',priceHint:'',sourceUrl:'',rightsNote:'',rightsConfirmed:false,published:false,version:0};}
function edit(row:Row){if(busy.value)return;existing.value=true;form.value={id:row._id,title:row.title,summary:row.summary,category:row.legacyCategory?'其他':row.category,link:row.link,priceHint:row.priceHint,sourceUrl:row.sourceUrl,rightsNote:row.rightsNote,rightsConfirmed:row.rightsConfirmed,published:row.published,version:row.version};}
async function unpublish(row:Row){
 if(busy.value)return;const ctx=context();if(!ctx)return;busy.value=true;error.value='';
 try{const answer=await uni.showModal({title:'撤下导购条目',content:`确认撤下“${row.title}”？`,confirmText:'撤下'});if(!current(ctx)||!answer.confirm)return;
  const res=await callCloud<{saved:boolean;id:string;version:number}>('social-manage',{action:'guides.unpublish',id:row._id,version:row.version});if(!current(ctx))return;
  if(!res.ok||res.data?.saved!==true||res.data.id!==row._id||res.data.version!==row.version+1)throw new Error(res.errMsg||'撤下未确认，请刷新核对');
  rows.value=rows.value.map(old=>old._id===row._id?{...old,published:false,version:row.version+1}:old);
  if(form.value?.id===row._id)form.value=null;
  uni.showToast({title:'已撤下',icon:'none'});
 }catch(e){if(current(ctx))error.value=e instanceof Error?e.message:'撤下失败';}finally{if(current(ctx))busy.value=false;}
}
async function save(){
 if(busy.value||!form.value)return;const ctx=context();if(!ctx){error.value='请先登录';return;}
 const draft=form.value;
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(draft.id)||!draft.title.trim()||draft.title.trim().length>200||draft.summary.length>2000||!categories.includes(draft.category)||draft.priceHint.length>100||!Number.isInteger(draft.version)||draft.version<0){error.value='请检查条目ID、标题、分类、说明和版本';return;}
 if(!draft.rightsConfirmed||!draft.rightsNote.trim()){error.value='发布或保存前必须确认实际使用授权，并填写授权依据';return;}
 const validHttps=(value:string)=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443');}catch{return false;}};
 if(draft.link.length>2048||draft.sourceUrl.length>2048||!validHttps(draft.link)||!validHttps(draft.sourceUrl)){error.value='商品链接和归属来源必须是有效的 HTTPS 地址，且不能含账号密码或非标准端口';return;}
 const snapshot={...draft,id:draft.id.trim(),title:draft.title.trim(),summary:draft.summary.trim(),priceHint:draft.priceHint.trim(),rightsNote:draft.rightsNote.trim()};
 busy.value=true;error.value='';
 try{const res=await callCloud<{saved:boolean;id:string;version:number}>('social-manage',{action:'guides.save',...snapshot});if(!current(ctx))return;
  if(!res.ok||res.data?.saved!==true||res.data.id!==snapshot.id||res.data.version!==snapshot.version+1)throw new Error(res.errMsg||'保存未确认，请刷新核对');
  form.value=null;uni.showToast({title:snapshot.published?'已发布':'已保存为未发布',icon:'none'});
 }catch(e){if(current(ctx))error.value=e instanceof Error?e.message:'保存失败';}finally{if(current(ctx))busy.value=false;}
 if(current(ctx)&&!form.value)await load(false);
}
</script>
<style scoped>.page{padding:14px;box-sizing:border-box;min-height:100vh;background:#080d17;color:#eef4ea}.card{padding:12px;margin:10px 0;background:#1b2b32;border-radius:8px}text{display:block;margin:8px 0}.title{font-size:18px}input,textarea{padding:8px;margin:6px 0;background:#101820;width:100%;box-sizing:border-box}button{margin:6px 0}</style>
