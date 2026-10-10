import { expect, test } from '@playwright/test';

test('registro, captura, audio, sincronización, reinicio y reconocimiento simulados', async ({ page }) => {
  const email = `demo-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('demo-password-123');
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill('demo-password-123');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.getByRole('button', { name: 'Modo demostración' }).click();
  await expect(page.getByText('No hay un guante físico conectado.')).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar simulador' }).click();
  await expect(page.getByText('Modo demostración · sin hardware real')).toBeVisible();

  await page.getByRole('link', { name: 'Crear gesto' }).click();
  await page.getByRole('button', { name: 'Iniciar captura' }).click();
  await expect(page.getByRole('heading', { name: 'Captura completada' })).toBeVisible();
  await page.getByLabel(/Nombre del gesto/i).fill('Necesito agua');
  await page.getByRole('button', { name: 'Guardar gesto' }).click();
  await expect(page).toHaveURL(/\/gestures\/\d+$/);

  await page.getByRole('button', { name: 'Generar audio' }).click();
  await expect(page.getByText('Generado', { exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Sincronizar' }).click();
  await page.getByRole('button', { name: /Sincronizar 1 gesto/ }).click();
  await expect(page.getByText('Perfil actualizado en MITTEN')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Preparar microSD' }).click();
  expect((await download).suggestedFilename()).toBe('mitten-microsd.zip');

  await page.getByRole('link', { name: 'Panel', exact: true }).click();
  await page.getByRole('button', { name: 'Reiniciar dispositivo simulado' }).click();
  await page.getByRole('button', { name: 'Simular reconocimiento' }).click();
  await expect(page.getByText(/Reconocimiento simulado: gesto/)).toBeVisible();
});
