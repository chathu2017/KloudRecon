/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // IPv4 loopback like uvicorn: on Windows `localhost` may bind ::1 only, which some browsers
    // and tools do not try. http://localhost:5173 still works (browsers fall back to 127.0.0.1).
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Playwright writes traces/reports under e2e/; watching them reloads pages mid-test.
    watch: { ignored: ['**/e2e/**', '**/playwright-report/**', '**/test-results/**'] },
    proxy: {
      // Local only: the SPA calls /api and Vite forwards it to uvicorn.
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@azure/msal')) return 'msal';
          // Radix and cmdk are left to the default splitting, so public pages load only the
          // primitives they use (decision 0043: landing page performance budget).
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // CSS is not processed in tests, except the theme file read by styles/tokens.test.ts
    css: { include: [/tokens.css/] },
  },
});
