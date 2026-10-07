import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import path from "node:path";
import {cpSync,mkdirSync} from "node:fs";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), {
    name: 'hiking-h5-map-assets',
    apply: 'build',
    closeBundle() {
      if (process.env.UNI_PLATFORM !== 'h5') return;
      const output = path.resolve(process.env.UNI_OUTPUT_DIR || 'dist/build/h5');
      const relative = path.relative(path.resolve(__dirname, 'dist'), output);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unexpected client build output');
      const target = path.join(output, 'static', 'offline-maps');
      mkdirSync(target, {recursive: true});
      cpSync(path.resolve(__dirname, 'map-assets/static/offline-maps'), target, {recursive: true});
    },
  }],
  base: process.env.VITE_DESKTOP === "true" ? "./" : (process.env.VITE_PUBLIC_BASE || "/"),
  resolve: {
    alias: {
      // Monorepo 共享层：shared/（类型 / 导航算法 / 常量 / 种子数据）
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    fs: { allow: [path.resolve(__dirname, "..")] },
  },
});
