#!/usr/bin/env node
// Serve the built app over HTTPS on the local network so phones can use the camera.
// Usage: npm run dev:https [-- --regen]   (hot-reload dev server over HTTPS)
//        npm run serve:https               (serves the production build instead)
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';

const dir = '.certs';
const key = join(dir, 'key.pem');
const cert = join(dir, 'cert.pem');
const dev = process.argv.includes('--dev') || process.env.npm_lifecycle_event === 'dev:https';

const ips = Object.values(networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
const names = ['localhost', ...ips];

function has(cmd, arg) {
  try { execFileSync(cmd, [arg], { stdio: 'ignore' }); return true; } catch { return false; }
}

// Run local bins with node directly: spawning `npx`/`npm` fails on Windows (they are .cmd shims).
const require = createRequire(import.meta.url);
const bin = (pkg, file) => join(dirname(require.resolve(`${pkg}/package.json`)), file);
const node = (script, args = []) => spawn(process.execPath, [script, ...args], { stdio: 'inherit', env });

if (!existsSync(cert) || process.argv.includes('--regen')) {
  mkdirSync(dir, { recursive: true });
  if (has('mkcert', '-version')) {
    // mkcert certs are trusted on this machine; install its root CA on phones for no warnings.
    execFileSync('mkcert', ['-key-file', key, '-cert-file', cert, ...names], { stdio: 'inherit' });
  } else if (has('openssl', 'version')) {
    const san = names.map((n) => (/^\d/.test(n) ? `IP:${n}` : `DNS:${n}`)).join(',');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
      '-keyout', key, '-out', cert, '-subj', '/CN=potsize', '-addext', `subjectAltName=${san}`],
      { stdio: 'inherit' });
    console.log('Self-signed cert created: phones will show a one-time warning; accept it to continue.');
  } else {
    console.error('Need mkcert or openssl on PATH to create a certificate.');
    console.error('Windows: `winget install FiloSottile.mkcert` (then `mkcert -install`), or install Git for Windows and add its usr\\bin to PATH.');
    process.exit(1);
  }
}

const env = { ...process.env, POTSIZE_TLS_KEY: key, POTSIZE_TLS_CERT: cert };
const vite = bin('vite', 'bin/vite.js');
const tsc = bin('typescript', 'bin/tsc');

console.log('\nOpen on your phone (same Wi-Fi):');
for (const ip of ips) console.log(`  https://${ip}:${dev ? 5173 : 4443}`);
console.log('');

const exit = (p) => p.on('exit', (c) => process.exit(c ?? 0));
const then = (p, next) => p.on('exit', (c) => (c ? process.exit(c) : next()));

if (dev) {
  exit(node(vite));
} else {
  then(node(tsc, ['--noEmit']), () => then(node(vite, ['build']), () => exit(node(vite, ['preview']))));
}
