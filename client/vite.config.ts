import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev, proxy the API and Socket.io to the backend so everything is same-origin
// (which also means the HttpOnly refresh cookie works with SameSite=Lax).
const target = process.env.VITE_DEV_API ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/socket.io': { target, ws: true, changeOrigin: true },
    },
  },
});
