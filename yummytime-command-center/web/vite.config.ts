import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API = `http://localhost:${process.env.PORT ?? 4000}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // reachable from phone on same Wi-Fi
    port: 5173,
    proxy: {
      '/api': API,
      '/ws': { target: API.replace('http', 'ws'), ws: true },
    },
  },
});
