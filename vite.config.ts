import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { handleLogSession, handleVisits, productionDeps } from './src/server/http';
import { handleCreate, handleLogin, handleLogout, handleSave, productionProfileDeps } from './src/server/profiles';

const root = fileURLToPath(new URL('.', import.meta.url));

function visitDevApi(): Plugin {
  return {
    name: 'visit-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const raw = req.url ?? '';
        const path = raw.split('?')[0] ?? '';
        if (path === '/logs') {
          const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
          req.url = `/logs.html${query}`;
          next();
          return;
        }
        const profilePath =
          path === '/api/login' || path === '/api/profiles' || path === '/api/progress' || path === '/api/logout';
        if (path !== '/api/visits' && path !== '/api/logs/session' && !profilePath) {
          next();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value == null) continue;
            if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
            else headers.set(key, value);
          }
          const host = req.headers.host ?? 'localhost';
          const method = req.method ?? 'GET';
          const request = new Request(`http://${host}${raw}`, {
            method,
            headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
          });
          const profileDeps = () => productionProfileDeps(request);
          const response = profilePath
            ? path === '/api/login'
              ? await handleLogin(request, profileDeps())
              : path === '/api/profiles'
                ? await handleCreate(request, profileDeps())
                : path === '/api/progress'
                  ? await handleSave(request, profileDeps())
                  : await handleLogout(request, profileDeps())
            : path === '/api/logs/session'
              ? await handleLogSession(request, productionDeps(request))
              : await handleVisits(request, productionDeps(request));
          res.statusCode = response.status;
          const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
          if (cookies.length > 0) res.setHeader('set-cookie', cookies);
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'set-cookie') return;
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error(err);
          next(err instanceof Error ? err : new Error('visit api failed'));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    visitDevApi(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hockey Defence Trainer',
        short_name: 'D Trainer',
        description: 'Learn where to go. Protect the ice. Help your team!',
        start_url: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b1633',
        theme_color: '#0b1633',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/logs/, /^\/api\//],
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        logs: resolve(root, 'logs.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
