<template>
  <view class="plot">
    <canvas :canvas-id="canvasId" :id="canvasId" class="canvas" :style="{ height: height + 'px' }" />
    <view v-if="attribution" class="legend">离线资料来源：{{ attribution }}</view>
    <view class="legend">轨迹示意 · WGS84 · 绿色起点 / 红色终点 · 不含地形底图</view>
  </view>
</template>
<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, ref, watch } from 'vue';
type Point = { latitude: number; longitude: number; segmentStart?: boolean };
const props = withDefaults(defineProps<{ points: Point[]; position?: Point | null; height?: number; layers?: [number, number][][]; attribution?: string }>(), { height: 260, layers: () => [], attribution: '' });
const canvasId = `track-${Math.random().toString(36).slice(2, 10)}`;
const instance = getCurrentInstance(); const width = ref(300);
function projected(p: Point, origin: number) {
  let longitude = p.longitude;
  while (longitude - origin > 180) longitude -= 360;
  while (longitude - origin < -180) longitude += 360;
  const latitude = Math.max(-85.05, Math.min(85.05, p.latitude)) * Math.PI / 180;
  return { x: longitude * Math.PI / 180, y: -Math.log(Math.tan(Math.PI / 4 + latitude / 2)) };
}
async function draw() {
  await nextTick();
  const ctx = uni.createCanvasContext(canvasId, instance?.proxy);
  const w = width.value, h = props.height;
  ctx.setFillStyle('#151d27'); ctx.fillRect(0, 0, w, h);
  ctx.setStrokeStyle('#22313f'); ctx.setLineWidth(1);
  for (let x = 20; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 20; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const valid = props.points.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  const base = props.layers.flat().map(([longitude, latitude]) => ({ longitude, latitude }));
  if (!valid.length && !base.length) { ctx.setFillStyle('#8a97a5'); ctx.fillText('等待轨迹或当前位置', 24, h / 2); ctx.draw(); return; }
  const origin = (valid[0] || base[0]).longitude;
  const projectedPoints = valid.map(p => projected(p, origin));
  const current = props.position ? projected(props.position, origin) : null;
  const viewport = projectedPoints.length ? projectedPoints : base.map(p => projected(p, origin));
  const all = current ? [...viewport, current] : viewport;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of all) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const scale = Math.min((w - 48) / Math.max(maxX - minX, 0.00001), (h - 48) / Math.max(maxY - minY, 0.00001));
  const screen = (p: { x: number; y: number }) => ({ x: w / 2 + (p.x - (minX + maxX) / 2) * scale, y: h / 2 + (p.y - (minY + maxY) / 2) * scale });
  ctx.setStrokeStyle('#607888'); ctx.setLineWidth(1);
  for (const line of props.layers) {
    ctx.beginPath(); line.forEach(([longitude, latitude], i) => { const p = screen(projected({ longitude, latitude }, origin)); if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.stroke();
  }
  ctx.setStrokeStyle('#b8f36b'); ctx.setLineWidth(3); ctx.beginPath();
  // Never connect gaps in imported or paused tracks.
  projectedPoints.forEach((p, i) => { const s = screen(p); if (!i || valid[i].segmentStart) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); }); ctx.stroke();
  const dot = (p: { x: number; y: number }, color: string, radius: number) => { const s = screen(p); ctx.setFillStyle(color); ctx.beginPath(); ctx.arc(s.x, s.y, radius, 0, Math.PI * 2); ctx.fill(); };
  if (projectedPoints.length) { dot(projectedPoints[0], '#b8f36b', 5); dot(projectedPoints[projectedPoints.length - 1], '#ff7b72', 5); }
  if (current) dot(current, '#65c7ff', 6);
  ctx.draw();
}
onMounted(() => {
  uni.createSelectorQuery().in(instance?.proxy).select(`#${canvasId}`).boundingClientRect((rect: any) => {
    if (rect?.width) width.value = rect.width; draw();
  }).exec();
});
watch(() => [props.points, props.position, props.height, props.layers], draw, { deep: true });
</script>
<style scoped>
.plot{width:100%;background:#151d27;border-radius:12px;overflow:hidden}.canvas{width:100%}.legend{padding:8px 12px;font-size:11px;color:#8a97a5}
</style>
