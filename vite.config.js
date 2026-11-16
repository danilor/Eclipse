import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    outDir: 'docs'
  },
  test: {
    include: ['tests/**/*.test.js'],
    testTimeout: 180000,
    hookTimeout: 60000,
  },
});
