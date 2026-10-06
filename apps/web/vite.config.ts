import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import commonjs from '@rollup/plugin-commonjs';

export default defineConfig({
  plugins: [
    react(),
    commonjs({
      include: [/packages\/contracts\/dist\/index\.js/, /@mitten\/contracts/],
      transformMixedEsModules: true,
      requireReturnsDefault: 'auto',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@mitten/contracts': path.resolve(__dirname, '../../packages/contracts/dist/index.js'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
