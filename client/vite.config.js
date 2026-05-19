import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: 'all',
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://typical-clay-shareware-motion.trycloudflare.com',
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  }
});
