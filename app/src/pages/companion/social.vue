<template>
 <scroll-view scroll-y class="page">
  <view class="tabs"><button v-for="mode in modes" :key="mode.key" :class="{selected:tab===mode.key}" @click="selectTab(mode.key)">{{ mode.name }}</button></view>
  <text v-if="error" class="error">{{ error }}</text>
  <button @click="openAccount">账号与登录</button>
  <view v-if="tab==='diaries'||tab==='comments'" class="card">
   <text class="title">{{ tab==='diaries'?'云端日记与手动打卡':'路线留言' }}</text>
   <text>路线：{{ routeName || '请选择路线' }}</text><input v-model="keyword" placeholder="搜索路线" />
   <view v-if="keyword" class="choices"><button v-for="route in matching" :key="route.id" @click="chooseRoute(route.id)">{{ route.name }} · {{ route.region }}</button></view>
   <input v-if="tab==='diaries'" v-model="title" maxlength="100" placeholder="日记标题" />
   <textarea v-model="body" maxlength="5000" placeholder="写下内容；公开内容需审核后展示" />
   <view v-if="tab==='diaries'"><view class="row"><text>公开日记（默认仅自己）</text><switch :checked="isPublic" @change="isPublic=eventValue($event)" /></view><view class="row"><text>手动标记已到访</text><switch :checked="checkedIn" @change="checkedIn=eventValue($event)" /></view></view>
   <button :disabled="busy||!routeId||!body.trim()" @click="save">{{ editing?'保存修改':'提交' }}</button>
   <button v-if="editing" @click="cancelEdit">取消编辑</button>
  </view>
  <view v-if="tab==='messages'" class="card"><text class="title">队内消息</text><text>仅当前有效队伍成员可见。后台暂停轮询，返回后继续。</text><textarea v-model="body" maxlength="1000" placeholder="给队友发送消息" /><button :disabled="busy||!body.trim()" @click="send">发送</button></view>
  <view v-if="tab==='diaries'" class="card"><text>已到访 {{ footprintCount }} 条路线（本页云日记手动标记）</text></view>
  <button :disabled="loading" @click="refresh">{{ loading?'加载中…':'刷新云端内容' }}</button>
  <view v-for="item in items" :key="item._id" class="card">
   <text class="title">{{ item.title || item.nickname || '徒步记录' }}</text><text v-if="item.body">{{ item.body }}</text>
   <text v-if="item.status">{{ statuses[item.status] || item.status }} · 版本 {{ item.version }}</text>
   <text>{{ new Date(item.updatedAt || item.createdAt).toLocaleString() }}</text>
   <view v-if="tab==='diaries'&&item.mine" class="row"><button @click="edit(item)">编辑</button><button @click="remove(item)">删除</button></view>
   <button v-if="tab==='notifications'&&!item.read" @click="read(item)">标为已读</button>
   <view v-if="tab==='moderation'" class="row"><button @click="decide(item,'approve')">通过</button><button @click="decide(item,'reject')">拒绝</button></view>
  </view>
  <text v-if="!items.length&&!loading">当前没有云端记录</text><button v-if="hasMore" :disabled="loading" @click="more">加载下一页</button>
 </scroll-view>
</template>
<script setup lang="ts">
function eventValue(event: Event): any { return (event as Event & {detail:{value:unknown}}).detail.value; }
import {computed,ref} from 'vue';
import {onLoad,onShow,onHide,onUnload} from '@dcloudio/uni-app';
import {callCloud} from '@/services/cloud';
import {accountSession,onAccountChange} from '@/services/account';
import {ROUTES} from '@/services/route-catalog';
const modes=[{key:'diaries',name:'日记'},{key:'comments',name:'留言'},{key:'messages',name:'队聊'},{key:'notifications',name:'通知'},{key:'moderation',name:'审核'}];
const statuses:Record<string,string>={private:'仅自己',pending:'待审核',approved:'已公开',rejected:'未通过'};
const tab=ref('diaries'),routeId=ref(''),keyword=ref(''),title=ref(''),body=ref(''),isPublic=ref(false),checkedIn=ref(false),editing=ref<any>(null);
const items=ref<any[]>([]),error=ref(''),busy=ref(false),loading=ref(false),hasMore=ref(false);let newId=`note-${Date.now()}-${Math.random().toString(36).slice(2)}`,messageId=`msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;let page=0,sequence=0,context=0,timer:ReturnType<typeof setInterval>|undefined;
const matching=computed(()=>ROUTES.filter(r=>`${r.name} ${r.region}`.toLowerCase().includes(keyword.value.toLowerCase())).slice(0,10));
const footprintCount=computed(()=>new Set(items.value.filter(item=>item.checkedIn).map(item=>item.routeId)).size);
function openAccount(){uni.navigateTo({url:'/pages/account/account'});}
const routeName=computed(()=>ROUTES.find(r=>r.id===routeId.value)?.name);
function teamId(){try{const raw=uni.getStorageSync('he_team');const team=typeof raw==='string'?JSON.parse(raw):raw;return team?.teamId||team?.id||'';}catch{return '';}}
const identity=()=>accountSession()?.openid || String(uni.getStorageSync('he_openid')||'');
function chooseRoute(id:string){context++;routeId.value=id;keyword.value='';if(tab.value==='comments')void refresh();}
function cancelEdit(){editing.value=null;title.value='';body.value='';isPublic.value=false;checkedIn.value=false;newId=`note-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function selectTab(value:string){context++;sequence++;items.value=[];hasMore.value=false;tab.value=value;cancelEdit();void refresh();}
async function load(append=false){
 const token=++sequence,owner=identity(),mode=tab.value;if(!owner){loading.value=false;hasMore.value=false;error.value='请先登录';items.value=[];return;}
 if(mode==='comments'&&!routeId.value){loading.value=false;hasMore.value=false;items.value=[];error.value='选择路线后查看留言';return;}
 const action=mode==='moderation'?'moderation.list':`${mode}.list`;loading.value=true;error.value='';
 try{const result=await callCloud<{items:any[];hasMore:boolean}>('social-manage',{action,page,routeId:routeId.value,teamId:teamId()});
  if(token!==sequence||owner!==identity())return;
  if(!result.ok||!result.data)throw new Error(result.errMsg||'加载失败');const rows=result.data.items;if(!Array.isArray(rows)||rows.length>(mode==='messages'?30:20)||typeof result.data.hasMore!=='boolean'||!rows.every(item=>item&&typeof item._id==='string'&&item._id.length>0)||new Set(rows.map(item=>item._id)).size!==rows.length)throw new Error('云端内容格式无效');items.value=append?[...items.value,...rows.filter(item=>!items.value.some(old=>old._id===item._id))]:rows;hasMore.value=result.data.hasMore;
 }catch(e:any){if(token===sequence){error.value=e.message;if(append)page=Math.max(0,page-1);}}finally{if(token===sequence)loading.value=false;}
}
function refresh(){page=0;return load();}function more(){if(loading.value)return;page++;void load(true);}
async function mutate(data:Record<string,unknown>){if(busy.value)return false;const owner=identity(),originalContext=context;if(!owner){error.value='请先登录';return false;}busy.value=true;error.value='';try{const result=await callCloud('social-manage',data);if(owner!==identity()||originalContext!==context)return false;if(!result.ok)throw new Error(result.errMsg||'操作失败');return true;}catch(e:any){if(owner===identity()&&originalContext===context)error.value=e.message;return false;}finally{busy.value=false;}}
async function save(){if(await mutate({action:tab.value==='diaries'?'diaries.save':'comments.create',id:editing.value?.clientId||newId,version:editing.value?.version||0,routeId:routeId.value,title:title.value,body:body.value,visibility:isPublic.value?'public':'private',checkedIn:checkedIn.value})){cancelEdit();await refresh();uni.showToast({title:tab.value==='comments'?'已提交审核':'已保存云端日记',icon:'none'});}}
function edit(item:any){editing.value=item;title.value=item.title;body.value=item.body;routeId.value=item.routeId;isPublic.value=item.visibility==='public';checkedIn.value=item.checkedIn;}
async function remove(item:any){const owner=identity(),originalContext=context;const result=await uni.showModal({title:'删除云端日记',content:'删除后其他设备也不再看到此记录，是否继续？'});if(result.confirm&&owner===identity()&&originalContext===context&&await mutate({action:'documents.remove',id:item._id}))await refresh();}
async function send(){if(await mutate({action:'messages.send',teamId:teamId(),id:messageId,body:body.value})){body.value='';messageId=`msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;await refresh();}}
async function read(item:any){if(await mutate({action:'notifications.read',id:item._id}))await refresh();}
async function decide(item:any,decision:string){if(await mutate({action:'moderation.decide',id:item._id,version:item.version,decision}))await refresh();}
function stop(){context++;if(timer)clearInterval(timer);timer=undefined;sequence++;loading.value=false;}
const unsubscribe=onAccountChange(()=>{stop();items.value=[];hasMore.value=false;cancelEdit();error.value='账号已变化，请刷新内容';});
onLoad(query=>{if(query?.routeId)routeId.value=query.routeId;if(query?.tab&&modes.some(m=>m.key===query.tab))tab.value=query.tab;});
onShow(()=>{void refresh();timer=setInterval(()=>{if(['messages','notifications'].includes(tab.value)&&!loading.value&&page===0)void load();},10000);});onHide(stop);onUnload(()=>{stop();unsubscribe();});
</script>
<style scoped>.page{background:#0f141b;min-height:100vh;padding:24rpx;box-sizing:border-box;color:#eef4ea}.tabs,.row{display:flex;gap:10rpx;flex-wrap:wrap}.tabs button{font-size:24rpx;padding:0 16rpx}.selected{background:#b8f36b}.card{display:flex;flex-direction:column;gap:16rpx;background:#1a2430;border-radius:20rpx;padding:24rpx;margin:20rpx 0}.title{font-size:32rpx;font-weight:700}.error{color:#ffd166}input,textarea{background:#0f141b;border-radius:12rpx;padding:18rpx;width:100%;box-sizing:border-box}textarea{height:200rpx}button{margin:0;color:#142010}.choices{display:flex;flex-direction:column;gap:8rpx}</style>
