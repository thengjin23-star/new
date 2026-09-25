import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // 模組式 worker（STEP 解析）
  worker: { format: 'es' },
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
      },
    }),
  ],
})
