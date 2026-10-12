# Droplet

一个建在飞船舷窗后面的个人博客。窗外是吸积盘，窗内只有你、我和那颗悬着的水滴。

线上地址：https://github-astronaut.github.io/droplet/

## 技术栈

- Vite 5 + 原生 JS / CSS，无框架
- 文章为 `content/posts/*.md`，构建时由 markdown-it 渲染
- 前端使用 hash 路由（`#/post/<slug>`），因此静态托管无需额外回退配置
- 静态资源在 `images/`，构建时原样拷贝到 `dist/`

## 本地开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 输出到 dist/
npm run preview  # 本地预览构建产物
```

## 部署

推送到 `main` 分支后，GitHub Actions（`.github/workflows/deploy.yml`）自动构建并发布到
GitHub Pages。

## 目录

```
content/posts/   文章正文（Markdown）
images/          舷窗素材与封面图
src/             入口、路由、渲染与样式
tools/           Inkstone 同步、图片尺寸等辅助脚本
docs/            设计规范与说明
```
