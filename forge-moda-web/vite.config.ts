/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// V1 Phase 2: production build output goes into the plugin's
// assets/iframe/ so the plugin can serve the iframe from its own
// install dir via Obsidian's app:// URL scheme. `base: "./"`
// makes the bundle's internal asset references work under any URL
// scheme (the default "/" would break under app://). Dev mode
// (`npm run dev`) keeps serving at localhost:5173; the plugin's
// moda-view loads from there when the `useDevIframe` setting is true.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../../forge-client-obsidian/assets/iframe',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
