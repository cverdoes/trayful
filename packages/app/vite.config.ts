import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the Vite server proxies API, socket and image requests to the
// Trayful server started by `pnpm dev` (default port 4317).
const server = `http://127.0.0.1:${process.env.TRAYFUL_PORT ?? 4317}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': server,
      '/project-files': server,
      '/ws': { target: server.replace('http', 'ws'), ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
