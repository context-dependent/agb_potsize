import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// When scripts/serve-https.mjs sets these, serve over HTTPS so phones allow camera access.
const key = process.env.POTSIZE_TLS_KEY;
const cert = process.env.POTSIZE_TLS_CERT;
const https = key && cert ? { key: readFileSync(key), cert: readFileSync(cert) } : undefined;

export default defineConfig({
  server: { https, host: https ? true : undefined },
  preview: { https, host: https ? true : undefined, port: 4443, strictPort: Boolean(https) },
});
