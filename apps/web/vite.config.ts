import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@mitten/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@mitten/esp32-simulator': path.resolve(__dirname, '../../tools/esp32-simulator/src/index.ts'),
    },
  },
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
