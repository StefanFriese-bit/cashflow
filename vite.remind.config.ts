import { defineConfig } from 'vite';

// Builds the morning-reminder script as one file (dist/remind.mjs) that the private store's daily job downloads.
export default defineConfig({
  build: {
    ssr: 'remind/main.ts',
    outDir: 'dist',
    emptyOutDir: false,
    target: 'node22',
    rollupOptions: { external: ['web-push', /^node:/], output: { entryFileNames: 'remind.mjs', format: 'es' } },
  },
  ssr: { noExternal: true, external: ['web-push'] },
});
