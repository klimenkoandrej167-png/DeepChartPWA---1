import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'DeepChart — Trading Terminal',
        short_name: 'DeepChart',
        description: 'Mobile trading terminal with AI analysis',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.twelvedata\.com\//,
            handler: 'NetworkFirst',
            options: { networkTimeoutSeconds: 10 },
          },
          {
            urlPattern: /^https:\/\/api\.binance\.com\//,
            handler: 'NetworkFirst',
            options: { networkTimeoutSeconds: 10 },
          },
          {
            urlPattern: /^https:\/\/finnhub\.io\//,
            handler: 'NetworkFirst',
            options: { networkTimeoutSeconds: 10 },
          },
          {
            urlPattern: /^https:\/\/query1\.finance\.yahoo\.com\//,
            handler: 'NetworkFirst',
            options: { networkTimeoutSeconds: 10 },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
