import { expect, test } from '@playwright/test';

const widths = [375, 768, 1024, 1440];

test('las superficies públicas no desbordan y conservan foco visible', async ({ page, request }) => {
  const favicon = await request.get('/brand/09_icono_app_oscuro.svg');
  expect(favicon.ok()).toBe(true);

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/login', '/register', '/privacidad']) {
      await page.goto(route);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${route} desborda a ${width}px`).toBeLessThanOrEqual(dimensions.clientWidth);
    }
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/login');
  const email = page.getByLabel('Email', { exact: true });
  for (let index = 0; index < 6 && !(await email.evaluate((element) => element === document.activeElement)); index += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(email).toBeFocused();
  const focusStyle = await email.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);
});

test('las superficies privadas responden sin overflow horizontal', async ({ page }) => {
  const email = `visual-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('visual-password-123');
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill('visual-password-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/app$/);

  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/app', '/gestures', '/learn', '/sync', '/account']) {
      await page.goto(route);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${route} desborda a ${width}px`).toBeLessThanOrEqual(dimensions.clientWidth);
    }
  }
});

test.use({ reducedMotion: 'reduce' });

test('la experiencia respeta movimiento reducido', async ({ page }) => {
  await page.goto('/');
  const durations = await page.locator('.hero-copy').evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.animationDuration, style.transitionDuration];
  });
  for (const durationList of durations) {
    for (const duration of durationList.split(',')) {
      const value = Number.parseFloat(duration);
      const milliseconds = duration.trim().endsWith('ms') ? value : value * 1000;
      expect(milliseconds).toBeLessThanOrEqual(20);
    }
  }
});
