import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Vite-only config. Vitest reads `vitest.config.ts` (which extends this one).
// Keeping them separate sidesteps the http-proxy type drift between
// Vite 8 and Vitest 2 in `defineConfig` overloads.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // `@/*` resolves to `src/*` — matches the path alias in tsconfig.app.json
      // and is the convention shadcn/ui generates imports against.
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
