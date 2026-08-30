import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// GitHub Pages serves project sites from /<repo>/, so assets need that prefix.
// Overridable via BASE_PATH for a custom domain or a different repo name.
const base = process.env.BASE_PATH ?? '/stuck-in-my-head-version-2/';

export default defineConfig({
  base,
  // One .env at the repo root feeds both the server (dotenv) and the client
  // (Vite, which only exposes VITE_-prefixed vars).
  envDir: '..',
  plugins: [react()],
  server: {
    // The recognition pipeline in ../shared lives outside the client root.
    fs: { allow: ['..'] },
  },
});
