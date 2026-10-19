import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure' },
  webServer: {
    command: 'node ../../tools/dev.mjs',
    url: 'http://127.0.0.1:5175/api/ready',
    reuseExistingServer: false,
    timeout: 40_000,
    env: { NODE_ENV: 'test', TTS_PROVIDER: 'fixture', PORT: '3101', WEB_PORT: '5175', VITE_CONTACT_EMAIL: 'equipo@example.com' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
