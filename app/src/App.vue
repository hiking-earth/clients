<script setup lang="ts">
import { refreshRouteCatalog } from '@/services/route-catalog';
import { stopBackgroundRecording } from '@/services/background';
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
onLaunch(() => {
  stopBackgroundRecording();
  refreshRouteCatalog();
});
onShow(() => {
  refreshRouteCatalog();
});
onHide(() => {
  console.log("App Hide");
});
</script>
<style></style>
