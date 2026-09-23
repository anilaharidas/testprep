import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allow access through a Cloudflare quick tunnel (*.trycloudflare.com) or a
    // named tunnel, plus local hosts.
    allowedHosts: ['.trycloudflare.com', '.cfargotunnel.com', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
});
