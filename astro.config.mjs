import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://tools.paobu.org',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  vite: {
    worker: {
      format: 'es',
    },
  },
});
