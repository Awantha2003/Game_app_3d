import { defineConfig } from 'vite';

// Relative base so the build also works from GitHub Pages or any sub-folder.
export default defineConfig({
  base: './',
  server: { host: true },
});
