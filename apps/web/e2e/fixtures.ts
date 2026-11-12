import { writeFile } from 'node:fs/promises';
import { expect, test as base, type Page } from '@playwright/test';

const routes = new Set(['/', '/login', '/register', '/app', '/api/auth/register', '/api/auth/login', '/api/auth/me']);
const route = (url: string) => {
  const path = new URL(url).pathname;
  return routes.has(path) ? path : 'other';
};

export const test = base.extend<{ diagnostics: void }>({
  diagnostics: [async ({ page }, use, testInfo) => {
    const events: Array<{ event: string; route?: string; method?: string; status?: number }> = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) events.push({ event: 'navigation', route: route(frame.url()) });
    });
    page.on('pageerror', () => events.push({ event: 'page error' }));
    page.on('console', message => {
      if (message.type() === 'error') events.push({ event: 'console error' });
    });
    page.on('request', request => {
      const path = route(request.url());
      if (path.startsWith('/api/')) events.push({ event: 'request', route: path, method: request.method() });
    });
    page.on('response', response => {
      const path = route(response.url());
      if (path.startsWith('/api/')) events.push({
        event: 'response', route: path, method: response.request().method(), status: response.status(),
      });
    });
    page.on('requestfailed', request => events.push({ event: 'request failed', route: route(request.url()) }));

    await use();

    if (testInfo.status !== testInfo.expectedStatus) {
      // Never include headers, bodies, DOM snapshots, console messages or input values.
      const registrationForm = route(page.url()) === '/register'
        ? await page.locator('form').evaluateAll(forms => forms.map(form => ({
            valid: form.matches(':valid'),
            populatedFields: Array.from(form.querySelectorAll('input')).filter(input => input.value !== '').length,
            invalidFields: form.querySelectorAll('input:invalid').length,
          }))).catch(() => null)
        : null;
      await writeFile(testInfo.outputPath('browser-diagnostics.json'), JSON.stringify({ events, registrationForm }, null, 2));
    }
  }, { auto: true }],
});

export async function registerAccount(page: Page, email: string, password: string) {
  const emailField = page.getByLabel('Email', { exact: true });
  const passwordField = page.getByLabel('Contraseña', { exact: true });
  const confirmation = page.getByLabel('Confirmar contraseña', { exact: true });
  const submit = page.getByRole('button', { name: 'Crear cuenta' });

  await expect(submit).toBeEnabled();
  await emailField.fill(email);
  await passwordField.fill(password);
  await confirmation.fill(password);

  const [response] = await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/auth/register', { timeout: 8_000 }),
    submit.click(),
  ]);
  expect(response.status(), 'POST /api/auth/register').toBe(201);
  await expect(page).toHaveURL(/\/app$/);
}
