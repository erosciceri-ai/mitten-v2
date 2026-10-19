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
    for (const [route, heading] of [
      ['/app', 'Prepará MITTEN para hablar'],
      ['/gestures', 'Biblioteca de gestos'],
      ['/gestures/new', 'Enseñar un gesto'],
      ['/sync', 'Sincronizar con MITTEN'],
      ['/account', 'Tu cuenta'],
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(new URL(route, page.url()).href);
      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        overflowingElements: Array.from(document.querySelectorAll('body *'))
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            className: typeof element.className === 'string' ? element.className : '',
            right: Math.round(element.getBoundingClientRect().right),
            width: Math.round(element.getBoundingClientRect().width),
          }))
          .filter((element) => element.right > document.documentElement.clientWidth)
          .sort((a, b) => b.right - a.right)
          .slice(0, 10),
      }));
      expect(dimensions.scrollWidth, `${route} desborda a ${width}px: ${JSON.stringify(dimensions.overflowingElements)}`).toBeLessThanOrEqual(dimensions.clientWidth);
      if (route === '/app') {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const navigationGeometry = await page.evaluate(() => {
          const desktopNavigation = document.querySelector('header nav[aria-label="Navegación principal"]');
          const mobileNavigation = document.querySelector('.app-mobile-nav');
          const footer = document.querySelector('footer');
          const visible = (element: Element | null) => Boolean(element && getComputedStyle(element).display !== 'none');
          const rect = (element: Element | null) => {
            if (!element) return null;
            const { top, bottom, left, right } = element.getBoundingClientRect();
            return { top: Math.round(top), bottom: Math.round(bottom), left: Math.round(left), right: Math.round(right) };
          };
          const footerLinks = Array.from(footer?.querySelectorAll('a') ?? []).map((link) => ({
            text: link.textContent?.trim(),
            rect: rect(link),
          }));
          const mobileRect = rect(mobileNavigation);
          const obscuredFooterLinks = footerLinks.filter(({ rect: linkRect }) =>
            visible(footer) && visible(mobileNavigation) && mobileRect && linkRect &&
            linkRect.bottom > mobileRect.top && linkRect.top < mobileRect.bottom,
          );
          return {
            desktopVisible: visible(desktopNavigation),
            mobileVisible: visible(mobileNavigation),
            footerVisible: visible(footer),
            mobileRect,
            footerLinks,
            obscuredFooterLinks,
          };
        });
        expect(Number(navigationGeometry.desktopVisible) + Number(navigationGeometry.mobileVisible), `${width}px navigation visibility: ${JSON.stringify(navigationGeometry)}`).toBe(1);
        expect(navigationGeometry.obscuredFooterLinks, `${width}px footer links obscured at scroll end: ${JSON.stringify(navigationGeometry)}`).toEqual([]);
        const navigation = page.locator(navigationGeometry.mobileVisible ? '.app-mobile-nav' : 'header nav[aria-label="Navegación principal"]');
        for (const link of await navigation.locator('a').all()) {
          await expect(link).toBeVisible();
          const href = await link.getAttribute('href');
          expect(href).toMatch(/^(\/app|\/gestures|\/sync)$/);
          await link.click();
          await expect(page).toHaveURL(new URL(href!, page.url()).href);
          await page.goto('/app');
        }
      }
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
