import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Atlas-client — the visitor wayfinding web app, separate from the admin
// dashboard. Designed to be embedded into an existing production web app via
// <iframe>, and also opened directly (QR/link). Runs on 5174 so it can run
// alongside the admin app (5173) in development.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
