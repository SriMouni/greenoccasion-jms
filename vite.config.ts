// Admin/editorial SPA build. Source lives in ./frontend; build outputs to
// ./frontend/dist, which the backend (backend/server.ts) serves in prod.
// The public reading site is a separate project (see ../web).
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    root: path.resolve(__dirname, 'frontend'),
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'frontend'),
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'frontend', 'dist'),
      emptyOutDir: true,
    },
    server: {
      // Admin dev server. The public app (./web) uses :3000; backend uses :3001.
      port: 3002,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': { target: 'http://localhost:3001', changeOrigin: true },
        '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
      },
    },
  };
});
