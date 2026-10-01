import {defineConfig} from 'vite';
import {resolve} from 'node:path';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    // Keep the ~250 flag SVGs as files so only the flags on screen are fetched.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        howItWorks: resolve(import.meta.dirname, 'how-it-works.html')
      }
    }
  },
  server: {port: 5173}
});
