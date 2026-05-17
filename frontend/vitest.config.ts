import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Reuses Vite plugins (React, Tailwind) + alias resolution and layers Vitest
// settings on top. Run with `pnpm test` or `pnpm test:run`.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      css: false,
    },
  }),
);
