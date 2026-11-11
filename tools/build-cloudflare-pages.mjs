import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const apiUrl = new URL(process.env.VITE_API_URL ?? '');
if (apiUrl.protocol !== 'https:' || apiUrl.username || apiUrl.password ||
    apiUrl.pathname !== '/api' || apiUrl.search || apiUrl.hash) {
  throw new Error('VITE_API_URL must be an HTTPS URL ending in /api');
}

const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script via npm run build:pages');

const googleClientId = process.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';

for (const workspace of ['@mitten/contracts', '@mitten/esp32-simulator', '@mitten/web']) {
  const result = spawnSync(process.execPath, [npm, 'run', 'build', '--workspace', workspace], {
    stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: apiUrl.href, VITE_GOOGLE_CLIENT_ID: googleClientId },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const dist = join(import.meta.dirname, '../apps/web/dist');
if (existsSync(join(dist, '404.html'))) throw new Error('A top-level 404.html disables Pages SPA fallback');

const google = Boolean(googleClientId);
const csp = [
  "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
  "script-src 'self'" + (google ? ' https://accounts.google.com/gsi/client' : ''),
  `connect-src 'self' ${apiUrl.origin}` + (google ? ' https://accounts.google.com/gsi/' : ''),
  google ? 'frame-src https://accounts.google.com/gsi/' : "frame-src 'none'",
  "style-src 'self' 'unsafe-inline'" + (google ? ' https://accounts.google.com/gsi/style' : ''),
  "img-src 'self' data:", "font-src 'self'", "media-src 'self' blob:",
];

writeFileSync(join(dist, '_headers'), [
  '/*',
  '  Strict-Transport-Security: max-age=31536000',
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Cross-Origin-Opener-Policy: same-origin-allow-popups',
  '  Permissions-Policy: serial=(self), camera=(), microphone=(), geolocation=()',
  '  Content-Security-Policy: ' + csp.join('; '),
  '',
].join('\n'));
