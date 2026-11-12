import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // Workspace packages are bundled from their TypeScript sources: no need to build them first.
    conditions: ['@back-in-stock/source', ...defaultClientConditions],
  },
  server: {
    port: 5173,
    // In dev, the API runs separately: `pnpm dev` (scripts/dev.mjs) picks its port and passes it here.
    // In production the server serves the built SPA.
    proxy: { '/api': `http://127.0.0.1:${process.env.BIS_DEV_API_PORT ?? 8081}` },
  },
});
