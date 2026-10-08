<script setup lang="ts">
import { refreshNews,setNewsForeground } from '@/services/news';
import {refreshOfficialOffline,setOfflineUpdatesForeground} from '@/services/offline-updates';
import { refreshRouteReviews } from '@/services/route-reviews';
import { checkForUpdate } from '@/services/updates';
import { startSync, setSyncForeground } from '@/services/sync';
import { refreshRouteCatalog } from '@/services/route-catalog';
import { stopBackgroundRecording } from '@/services/background';
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
let foregroundRefreshTimer:ReturnType<typeof setInterval>|undefined;
onLaunch(() => {
  stopBackgroundRecording();
  refreshRouteCatalog();
  void refreshRouteReviews();
  startSync();
  void checkForUpdate();
});
onShow(() => {
  setSyncForeground(true);
  setNewsForeground(true);
  setOfflineUpdatesForeground(true);
  if(foregroundRefreshTimer)clearInterval(foregroundRefreshTimer);
  foregroundRefreshTimer=setInterval(()=>{refreshRouteCatalog();void refreshRouteReviews();void checkForUpdate();void refreshOfficialOffline();void refreshNews();},15*60*1000);
  void checkForUpdate();
  refreshRouteCatalog();
  void refreshRouteReviews();
});
onHide(() => {
  if(foregroundRefreshTimer){clearInterval(foregroundRefreshTimer);foregroundRefreshTimer=undefined;}
  setSyncForeground(false);
  setNewsForeground(false);
  setOfflineUpdatesForeground(false);
  console.log("App Hide");
});
</script>
<style>
page{background:#01030a;color:#f4f8f2;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.55;--he-bg:#01030a;--he-panel:#050c12;--he-surface:#151f24;--he-accent:#b8f36b;--he-text:#f4f8f2;--he-muted:#a7b5aa;--he-border:#29323a}
button{font-size:14px;min-height:40px;line-height:1.4;padding:10px 16px;border-radius:12px;background:#151f24;color:#f4f8f2;border:1px solid #29323a;box-sizing:border-box}button::after{border:0}button[disabled]{opacity:.5}button[size=mini]{font-size:12px;min-height:34px;padding:7px 12px}input,textarea{color:#f4f8f2;box-sizing:border-box}textarea{width:100%}.page{box-sizing:border-box} @media(min-width:800px){.page:not(.explore-home){max-width:1080px;margin:0 auto;padding:32px!important}button{max-width:560px}input,textarea{max-width:760px}}
</style>
