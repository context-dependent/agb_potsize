#!/usr/bin/env node
// Serve the built app over HTTPS on the local network so phones can use the camera.
// Usage: npm run dev:https [-- --regen]   (hot-reload dev server over HTTPS)
//        npm run serve:https               (serves the production build instead)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

const dir = '.certs';
const key = join(dir, 'key.pem');
const cert = join(dir, 'cert.pem');
const dev = process.argv.includes('--dev') || process.env.npm_lifecycle_event === 'dev:https';

const ips = Object.values(networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
const names = ['localhost', ...ips];

function has(cmd) {
  try { execFileSync(cmd, ['--help'], { stdio: 'ignore' }); return true; } catch { return false; }
}

if (!existsSync(cert) || process.argv.includes('--regen')) {
  mkdirSync(dir, { recursive: true });
  if (has('mkcert')) {
    // mkcert certs are trusted on this machine; install its root CA on phones for no warnings.
    execFileSync('mkcert', ['-key-file', key, '-cert-file', cert, ...names], { stdio: 'inherit' });
  } else {
    const san = names.map((n) => (/^\d/.test(n) ? `IP:${n}` : `DNS:${n}`)).join(',');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
      '-keyout', key, '-out', cert, '-subj', '/CN=potsize', '-addext', `subjectAltName=${san}`],
      { stdio: 'inherit' });
    console.log('Self-signed cert created: phones will show a one-time warning; accept it to continue.');
  }
}

const env = { ...process.env, POTSIZE_TLS_KEY: key, POTSIZE_TLS_CERT: cert };
const run = (args) => spawn('npx', args, { stdio: 'inherit', env });

console.log('\nOpen on your phone (same Wi-Fi):');
for (const ip of ips) console.log(`  https://${ip}:${dev ? 5173 : 4443}`);
console.log('');

if (dev) {
  run(['vite']).on('exit', (c) => process.exit(c ?? 0));
} else {
  const build = spawn('npm', ['run', 'build'], { stdio: 'inherit', env });
  build.on('exit', (c) => {
    if (c) process.exit(c);
    run(['vite', 'preview']).on('exit', (c2) => process.exit(c2 ?? 0));
  });
}
