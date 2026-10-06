<script setup lang="ts">
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
  if(foregroundRefreshTimer)clearInterval(foregroundRefreshTimer);
  foregroundRefreshTimer=setInterval(()=>{refreshRouteCatalog();void refreshRouteReviews();void checkForUpdate();},15*60*1000);
  void checkForUpdate();
  refreshRouteCatalog();
  void refreshRouteReviews();
});
onHide(() => {
  if(foregroundRefreshTimer){clearInterval(foregroundRefreshTimer);foregroundRefreshTimer=undefined;}
  setSyncForeground(false);
  console.log("App Hide");
});
</script>
<style></style>
