import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'

// architecture.md §9. script-src/worker-src/connect-src/font-src/manifest-src/
// form-action are made explicit (they would otherwise inherit default-src).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "img-src 'self' blob: data:",
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

// A static meta CSP breaks Vite dev (inline React Refresh preamble + ws: HMR),
// so the strict policy is injected into the production HTML only.
function cspPlugin(): Plugin {
  return {
    name: 'opc-inject-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'OPC Vendors Cards',
        short_name: 'Vendors',
        description:
          'Offline field notebook for suppliers, dealers, agents, and factories met at trade fairs.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#D8321F',
        background_color: '#FFFFFF',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell only — user data lives in IndexedDB.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    css: true,
  },
})
