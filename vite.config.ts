import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// ⚠️ 确保您已运行 npm install -D vite-plugin-node-polyfills
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    // 注入 Node.js 兼容层，解决 JSZip 找不到 Buffer 的问题
    nodePolyfills({
      globals: {
        Buffer: true, // 关键：开启全局 Buffer 注入
        process: true,
      },
    }),
  ],
  // 针对现代浏览器环境优化
  build: {
    target: 'esnext',
  },
  // 解决开发阶段某些 CommonJS 包的预构建冲突
  optimizeDeps: {
    include: ['jszip', 'buffer'],
  }
})
