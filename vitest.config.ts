import { defineConfig } from 'vitest/config';

// Same condition as tsconfig.base.json: tests import workspace packages from their sources.
// The other entries are Vite's default server conditions, which setting this list replaces.
const conditions = ['@back-in-stock/source', 'module', 'node', 'development|production'];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    include: ['{apps,packages,plugins}/*/{src,test}/**/*.test.ts', 'scripts/**/*.test.ts'],
    passWithNoTests: true,
  },
});
