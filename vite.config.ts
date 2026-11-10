import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/cashflow/',
  build: { target: ['es2020', 'safari15'] },
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  plugins: [
    preact(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,woff2}'], globIgnores: ['remind.mjs'] },
      manifest: {
        name: 'Cash flow',
        short_name: 'Cash flow',
        description: 'Our household cash flow: what goes in and out, week by week, and what is due next.',
        theme_color: '#f4efe4',
        background_color: '#f4efe4',
        display: 'standalone',
        start_url: '/cashflow/',
        scope: '/cashflow/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
