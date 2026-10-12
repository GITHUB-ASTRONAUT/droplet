import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages 部署：相对路径，仓库名子目录也能跑
  base: './',
  // 直接用项目根的 images/ 作为静态资源目录，避免素材重复拷贝
  publicDir: 'images',
  server: { port: 5173, open: false },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
})
