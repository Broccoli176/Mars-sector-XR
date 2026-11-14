import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths.
  base: './',
  server: { host: true },
  // three.js alone is ~550 kB minified; a single chunk is fine for the prototype.
  // iwer must stay bundled (it is lazy-loaded with ?iwer); if the build cannot resolve it, run `npm ci`.
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
