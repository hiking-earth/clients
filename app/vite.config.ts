import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
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
