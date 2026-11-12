import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/*.[sS][mM][cC]', '**/*.[sS][fF][cC]'],
    },
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
      '/assets': { target: 'http://127.0.0.1:8787' },
    },
  },
  build: {
    assetsDir: 'bundle',
    chunkSizeWarningLimit: 1800,
  },
});
