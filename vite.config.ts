import {defineConfig} from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    // Keep the ~250 flag SVGs as files so only the flags on screen are fetched.
    assetsInlineLimit: 0
  },
  server: {port: 5173}
});
