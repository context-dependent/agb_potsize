import { defineConfig } from 'vite';

// In dev the backend runs separately (see README); forward API calls to it.
export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8000' } },
});
