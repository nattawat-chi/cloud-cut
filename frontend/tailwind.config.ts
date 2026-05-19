import type { Config } from 'tailwindcss';

// Tailwind v4 uses the @tailwindcss/vite plugin; this file exists for
// tooling compatibility (IDE autocomplete, explicit content paths).
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
