import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiOrigin = process.env.SMW_API_ORIGIN ?? 'http://127.0.0.1:8787';
const websocketOrigin = apiOrigin.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/*.[sS][mM][cC]', '**/*.[sS][fF][cC]'],
    },
    proxy: {
      '/api': { target: apiOrigin },
      '/ws': { target: websocketOrigin, ws: true },
      '/assets': { target: apiOrigin },
    },
  },
  build: {
    assetsDir: 'bundle',
    chunkSizeWarningLimit: 1800,
  },
});
