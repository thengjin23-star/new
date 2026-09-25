import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // 模組式 worker（STEP 解析）
  worker: { format: 'es' },
  // 開發模式：預先打包 STEP 解析元件，避免第一次匯入時 Vite 重新整理頁面
  optimizeDeps: { include: ['occt-import-js'] },
  // 3D 模組組立（three.js）是切換分頁時才載入的獨立 chunk，約 1.1 MB
  build: { chunkSizeWarningLimit: 1200 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '氣動迴路編輯與模擬器',
        short_name: '氣動模擬',
        description: '在瀏覽器中拖拉氣動元件、連接管線並即時模擬迴路動作。',
        lang: 'zh-Hant-TW',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#1e293b',
        background_color: '#f8fafc',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // STEP 解析元件（WASM 約 7.6 MB）：第一次使用時下載並快取，之後離線也能匯入
            urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: { cacheName: 'wasm', expiration: { maxEntries: 4 } },
          },
          {
            // 範例零件
            urlPattern: ({ url }) => url.pathname.includes('/samples/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'samples' },
          },
        ],
      },
    }),
  ],
})
