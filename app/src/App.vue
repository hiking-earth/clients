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
@import "../../shared/design/palette.css";
page{background:var(--he-color-background);color:var(--he-color-text);font-size:14px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.55;--he-bg:var(--he-color-background);--he-panel:var(--he-color-panel);--he-surface:var(--he-color-surface);--he-accent:var(--he-color-accent);--he-text:var(--he-color-text);--he-muted:var(--he-color-muted);--he-border:var(--he-color-border)}
button{font-size:14px;min-height:40px;line-height:1.4;padding:10px 16px;border-radius:12px;background:var(--he-color-surface);color:var(--he-color-text);border:1px solid var(--he-color-border);box-sizing:border-box}button.he-primary{background:var(--he-color-accent);border-color:var(--he-color-accent);color:#061006;font-weight:700}button::after{border:0}button[disabled]{opacity:.5}button[size=mini]{font-size:12px;min-height:34px;padding:7px 12px}input,textarea{color:var(--he-color-text);box-sizing:border-box}textarea{width:100%}.page{box-sizing:border-box} @media(min-width:800px){.page:not(.explore-home){max-width:1080px;margin:0 auto;padding:32px!important}button{max-width:560px}input,textarea{max-width:760px}}
</style>
