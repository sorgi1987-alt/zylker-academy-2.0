import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Catalyst serves the client from the project root, so relative asset paths.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', sourcemap: false },
  server: {
    proxy: {
      // Local development only. In production the client and the Advanced I/O
      // function are served from the same Catalyst domain.
      '/server': { target: 'http://localhost:3000', changeOrigin: true }
    }
  }
});
