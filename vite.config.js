import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths.
  base: './',
  server: { host: true },
  // three.js alone is ~550 kB minified; a single chunk is fine for the prototype.
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      external: ['iwer'],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
