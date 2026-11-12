import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const webOrigin = 'http://127.0.0.1:5175';
const apiOrigin = 'http://127.0.0.1:3101';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: { baseURL: webOrigin, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm run build --workspace=@mitten/api && node apps/api/dist/index.js',
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      url: apiOrigin + '/api/ready',
      timeout: 40_000,
      env: {
        NODE_ENV: 'test', TTS_PROVIDER: 'fixture', HOST: '127.0.0.1', PORT: '3101', FRONTEND_URL: webOrigin,
      },
    },
    {
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 5175 --strictPort',
      url: webOrigin + '/api/ready',
      timeout: 40_000,
      env: { API_PROXY_TARGET: apiOrigin, VITE_API_URL: '/api', VITE_GOOGLE_CLIENT_ID: '' },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
