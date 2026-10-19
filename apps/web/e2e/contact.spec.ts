import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

for (const width of [375, 768, 1024, 1440]) {
  test(`contact opens a Gmail draft with Spanish text at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Verify the real browser handoff without sending any data to Google.
    await context.route('https://mail.google.com/**', route => route.fulfill({ status: 200, body: 'Draft navigation verified.' }));
    await page.goto('/#contacto');
    await page.getByLabel('Tu nombre').fill('María & José');
    await page.getByLabel('Motivo').selectOption('Solicitar una demostración');
    const message = 'Hola, ¿podemos probar MITTEN?\nGracias.';
    await page.getByLabel('Mensaje').fill(message);
    await page.getByLabel('Mensaje').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Abrir con')).toBeFocused();
    const focus = await page.getByLabel('Abrir con').evaluate(element => {
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, shadow: style.boxShadow };
    });
    expect(focus.outline !== 'none' || focus.shadow !== 'none').toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('.contact-form').screenshot({ path: resolve('../../.runtime/voice-review', `contact-${width}.png`) });
    const popupPromise = context.waitForEvent('page');
    await page.getByRole('button', { name: 'Abrir Gmail' }).click();
    const draft = await popupPromise;
    await draft.waitForLoadState('domcontentloaded');
    const url = new URL(draft.url());
    expect(url.origin).toBe('https://mail.google.com');
    expect(url.searchParams.get('to')).toBe('equipo@example.com');
    expect(url.searchParams.get('su')).toBe('Consulta MITTEN · Solicitar una demostración');
    expect(url.searchParams.get('body')?.replaceAll('\r\n', '\n')).toBe(`Nombre: María & José\n\n${message}`);
    expect(await draft.evaluate(() => window.opener === null)).toBe(true);
    await draft.close();
    await expect(page.getByLabel('Mensaje')).toHaveValue(message);
  });
}
