import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const frontendRoot = path.resolve(__dirname);

export default defineConfig({
  root: frontendRoot,
  plugins: [react()],
  css: {
    postcss: path.join(frontendRoot, 'postcss.config.js'),
  },
  server: {
    port: 5173,
    proxy: {
      '/accounts': {
        target: 'http://localhost:8094',
        changeOrigin: true,
      },
      '/config': {
        target: 'http://localhost:8094',
        changeOrigin: true,
      },
      '/monitor': {
        target: 'http://localhost:8094',
        changeOrigin: true,
      },
      '/providers': {
        target: 'http://localhost:8094',
        changeOrigin: true,
      },
      '/oauth': {
        target: 'http://localhost:8094',
        changeOrigin: true,
      },
      '/v1': {
        target: 'http://localhost:8094',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8094',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
