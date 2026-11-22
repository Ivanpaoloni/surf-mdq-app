import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        ignoreURLParametersMatching: [/^spot$/],
      },
      manifest: {
        name: 'SurfMDQ · Pronóstico de surf',
        short_name: 'SurfMDQ',
        description:
          'Pronóstico de surf, mareas, viento y cámaras para Mar del Plata, Chapadmalal y Miramar.',
        start_url: '/',
        display: 'standalone',
        theme_color: '#fafafa',
        background_color: '#fafafa',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
