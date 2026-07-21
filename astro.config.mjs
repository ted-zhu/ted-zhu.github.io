import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// ──────────────────────────────────────────────
// GitHub Pages 部署配置
// 如果使用自定义域名 (ted-zhu.github.io)，将 base 改为 '/'
// 如果使用 username.github.io/blog/ 路径，保持 '/blog'
// ──────────────────────────────────────────────
export default defineConfig({
  site: 'https://ted-zhu.github.io',
  base: '/',
  outDir: './dist',
  integrations: [
    mdx(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
