// Builds the whole interface into one index.html next to the tracker, so the
// server, the updater and the installer keep handling a single page.
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {viteSingleFile} from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '..',
    emptyOutDir: false,          // never wipe the tracker folder
    assetsInlineLimit: 100000000, // fonts and the logo go inside the page
    chunkSizeWarningLimit: 5000,
  },
  server: {proxy: {'/api': {target: 'http://127.0.0.1:8787', changeOrigin: true}}},
});
