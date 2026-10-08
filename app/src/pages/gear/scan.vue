<template>
  <scroll-view scroll-y class="page">
    <view class="intro">
      <text class="intro-title">拍照识装备</text>
      <text class="intro-sub">选择照片，获取图像检测候选和出行核对清单</text>
    </view>

    <!-- 选路线（可选，影响规划建议） -->
    <RouteSearchPicker v-model="routeId" placeholder="搜索或选择关联路线（可选，让规划更准）" @selected="onRouteSelected" />

    <!-- 拍照区 -->
    <view class="shot" @click="chooseImage">
      <image v-if="imagePath" :src="imagePath" mode="aspectFill" class="shot-img" />
      <view v-else class="shot-empty">
        <text class="shot-icon">📷</text>
        <text class="shot-text">拍照或从相册选择</text>
      </view>
    </view>

    <button class="btn primary" :disabled="!imagePath || analyzing" @click="analyze">
      {{ analyzing ? '识别中…' : '开始识别' }}
    </button>

    <!-- 识别结果 -->
    <template v-if="result">
      <view class="sec">
        <text class="sec-title">识别到的装备（{{ result.items.length }}）</text>
        <view v-for="(it, i) in result.items" :key="i" class="item">
          <text class="item-name">{{ it.name }}</text>
          <text class="item-cat">{{ it.category }}</text>
        </view>
      </view>

      <view class="sec" v-if="result.missing.length">
        <text class="sec-title warn">还缺这些（按优先级）</text>
        <view v-for="(m, i) in result.missing" :key="i" class="item">
          <text class="item-name">{{ m.name }}</text>
          <text class="item-why">{{ m.reason }}</text>
        </view>
      </view>

      <view class="sec" v-if="result.usage.length">
        <text class="sec-title">使用要点</text>
        <view v-for="(u, i) in result.usage" :key="i" class="usage">
          <text class="usage-dot">·</text><text class="usage-text">{{ u }}</text>
        </view>
      </view>

      <view class="sec" v-if="result.plan.length">
        <text class="sec-title accent">出行装备清单（可直接照着打包）</text>
        <view v-for="(p, i) in result.plan" :key="i" class="plan" @click="p.checked = !p.checked">
          <view class="check" :class="{ on: p.checked }">{{ p.checked ? '✓' : '' }}</view>
          <text class="plan-text" :class="{ done: p.checked }">{{ p.name }}</text>
        </view>
      </view>
    </template>

    <!-- #ifdef H5 --><view class="notice">免费本机图像检测：照片不上传，模型首次使用会读取约20 MB资料。仅识别部分通用物体；候选结果须本人确认，不能判断完整装备或安全性。</view><!-- #endif -->
    <!-- #ifndef H5 --><view class="notice">免费云端分析须主动授权：照片发送到徒步地球云端进行有限类别识别，默认不调用第三方视觉服务。请使用4 MB、400万像素以内的JPEG或PNG照片；候选结果须本人确认。</view><!-- #endif -->
  </scroll-view>
</template>

<script setup lang="ts">
import { ref } from "vue";
// #ifdef H5
import { analyzeGearLocally } from "@/services/gear-local";
// #endif
declare const plus: any;
import RouteSearchPicker from '@/components/RouteSearchPicker.vue';
import { callCloud } from "@/services/cloud";
import {onShow,onHide,onUnload} from "@dcloudio/uni-app";
import {accountSession,onAccountChange} from "@/services/account";
import { hasPrivacyConsent,onPrivacyChange } from "@/services/privacy";
import {createPhotoSelection} from '@/services/photo-selection';

type GearItem = { name: string; category: string };
type GearResult = {
  items: GearItem[];
  missing: { name: string; reason: string }[];
  usage: string[];
  plan: { name: string; checked: boolean }[];
};

const routeId = ref("");
const routeName = ref("");
const imagePath = ref("");
const analyzing = ref(false);
const result = ref<GearResult | null>(null);

let generation=0,visible=true;
function invalidate(){generation++;analyzing.value=false;result.value=null;}
const photoSelection=createPhotoSelection(()=>accountSession()?.token,path=>{imagePath.value=path;result.value=null;});
const offAccount=onAccountChange(()=>{photoSelection.reset();invalidate();imagePath.value="";});
const offPrivacy=onPrivacyChange(consents=>{if(!consents.gearImageUpload)invalidate();});
onShow(()=>{visible=true;photoSelection.show();});onHide(()=>{visible=false;photoSelection.hide();invalidate();});onUnload(()=>{visible=false;photoSelection.dispose();invalidate();offAccount();offPrivacy();});
function validResult(value:any):value is GearResult{
 const text=(v:any,max:number)=>typeof v==="string"&&v.trim().length>0&&v.length<=max;
 return !!value&&Array.isArray(value.items)&&value.items.length<=100&&value.items.every((i:any)=>i&&text(i.name,200)&&text(i.category,100))&&Array.isArray(value.missing)&&value.missing.length<=100&&value.missing.every((i:any)=>i&&text(i.name,200)&&text(i.reason,1000))&&Array.isArray(value.usage)&&value.usage.length<=30&&value.usage.every((i:any)=>text(i,1000))&&Array.isArray(value.plan)&&value.plan.length<=100&&value.plan.every((i:any)=>i&&text(i.name,200));
}
function onRouteSelected(route: { id: string; name: string } | null) {
  invalidate();
  routeId.value = route?.id ?? "";
  routeName.value = route?.name ?? "";
}

function chooseImage() {
  if(analyzing.value)return;
  invalidate();
  const ticket=photoSelection.begin();
  uni.chooseImage({
    count: 1,
    sourceType: ["camera", "album"],
    success: (res) => {
      photoSelection.complete(ticket,res.tempFilePaths[0]);
    },
  });
}

async function analyze() {
  if (!imagePath.value || analyzing.value) return;
  // #ifndef H5
  if (!hasPrivacyConsent("gearImageUpload")) {
    uni.showModal({
      title: "需要照片分析授权",
      content: "识别会将你选择的照片发送到云端视觉模型。请先在“我的 → 隐私设置”中启用装备照片云端分析。",
      showCancel: false,
    });
    return;
  }
  // #endif
  analyzing.value = true;
  const epoch=++generation,path=imagePath.value,selectedRoute=routeId.value,selectedName=routeName.value,token=accountSession()?.token;
  let requiresUpload=false;
  // #ifndef H5
  requiresUpload=true;
  // #endif
  const current=()=>visible&&epoch===generation&&(!requiresUpload||hasPrivacyConsent("gearImageUpload"))&&accountSession()?.token===token&&imagePath.value===path&&routeId.value===selectedRoute;
  try {
    // #ifdef H5
    const local=await analyzeGearLocally(path);
    if(current())result.value={...local,plan:local.plan.map(p=>({...p,checked:false}))};
    // #endif
    // #ifndef H5
    // 小程序文件系统、App 原生文件读取分别处理。
    const base64 = await readAsBase64(path);
    if(!current())return;
    if(base64.length>Math.ceil(4*1024*1024/3)*4)throw new Error("请选择4 MB以内的照片");
    const res = await callCloud<GearResult>("gear-scan", {
      image: base64,
      routeId: selectedRoute,
      routeName: selectedName,
    });
    if(!current())return;
    if (res.ok && validResult(res.data)) {
      result.value = {
        items:res.data.items,missing:res.data.missing,usage:res.data.usage,
        plan: (res.data.plan ?? []).map((p: any) => ({ name: p.name ?? p, checked: false })),
      };
    } else {
      uni.showToast({ title: res.errMsg ?? "识别失败", icon: "none" });
    }
    // #endif
  } catch (e) {
    if(!current())return;
    uni.showToast({ title: e instanceof Error ? e.message : "图片读取或识别失败", icon: "none" });
  } finally {
    if(epoch===generation)analyzing.value = false;
  }
}

function readAsBase64(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // #ifdef H5
    fetch(path)
      .then((r) => r.blob())
      .then((blob) => {
        if (blob.size > 4 * 1024 * 1024) throw new Error("请选择 4 MB 以内的照片");
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
      .catch(reject);
    // #endif
    // #ifdef APP-PLUS
    plus.io.resolveLocalFileSystemURL(path, (entry: any) => {
      entry.file((file: any) => {
        if (file.size > 4 * 1024 * 1024) { reject(new Error("请选择 4 MB 以内的照片")); return; }
        const reader = new plus.io.FileReader();
        reader.onload = (e: any) => resolve(String(e.target.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }, reject);
    }, reject);
    // #endif
    // #ifdef MP-WEIXIN
    uni.getFileInfo({
      filePath: path,
      success: (info: { size: number }) => {
        if (!Number.isFinite(info.size) || info.size < 0 || info.size > 4 * 1024 * 1024) {
          reject(new Error("请选择 4 MB 以内的照片"));
          return;
        }
        uni.getFileSystemManager().readFile({
          filePath: path,
          encoding: "base64",
          success: (res: any) => resolve(res.data as string),
          fail: reject,
        });
      },
      fail: reject,
    });
    // #endif
  });
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #080d17; padding: 16px; box-sizing: border-box; }
.intro-title { display: block; font-size: 22px; font-weight: 700; color: #eef4ea; }
.intro-sub { display: block; margin-top: 4px; font-size: 12px; color: #a0b2b3; }
.picker { margin-top: 12px; background: #1b2b32; border-radius: 8px; padding: 10px 12px; font-size: 13px; color: #a0b2b3; }
.shot { margin-top: 12px; height: 210px; background: #101c24; border-radius: 10px; overflow: hidden; }
.shot-img { width: 100%; height: 100%; }
.shot-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
.shot-icon { font-size: 36px; }
.shot-text { font-size: 13px; color: #91aaa7; }
.btn.primary { margin-top: 12px; background: #48c9a8; color: #080d17; font-weight: 600; border-radius: 499.5px; font-size: 15px; }
.btn[disabled] { background: #1b2b32; color: #91aaa7; }
.sec { margin-top: 18px; }
.sec-title { display: block; font-size: 14px; font-weight: 600; color: #eef4ea; margin-bottom: 8px; }
.sec-title.warn { color: #ffd166; }
.sec-title.accent { color: #48c9a8; }
.item { display: flex; align-items: center; justify-content: space-between; background: #101c24; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }
.item-name { font-size: 14px; color: #eef4ea; }
.item-cat { font-size: 11px; color: #91aaa7; }
.item-why { font-size: 11px; color: #ffd166; max-width: 60%; text-align: right; }
.usage { display: flex; gap: 6px; margin-bottom: 4px; }
.usage-dot { color: #48c9a8; }
.usage-text { font-size: 13px; color: #a0b2b3; line-height: 1.6; }
.plan { display: flex; align-items: center; gap: 10px; background: #101c24; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }
.check { width: 20px; height: 20px; border-radius: 50%; border: 1px solid #91aaa7; display: flex; align-items: center; justify-content: center; color: #080d17; font-size: 12px; }
.check.on { background: #48c9a8; border-color: #48c9a8; font-weight: 700; }
.plan-text { font-size: 14px; color: #eef4ea; }
.plan-text.done { color: #91aaa7; text-decoration: line-through; }
.notice { margin: 18px 0 32px; font-size: 10px; color: #91aaa7; line-height: 1.7; }
</style>
