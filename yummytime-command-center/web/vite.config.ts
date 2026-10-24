import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API = `http://localhost:${process.env.PORT ?? 4000}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Demo build is published as one self-contained page
  build: process.env.VITE_DEMO === '1' ? { outDir: 'dist-demo', rollupOptions: { output: { inlineDynamicImports: true } } } : undefined,
  server: {
    host: true, // reachable from phone on same Wi-Fi
    port: 5173,
    proxy: {
      '/api': API,
      '/ws': { target: API.replace('http', 'ws'), ws: true },
    },
  },
});
