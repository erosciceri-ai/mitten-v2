import { expect } from '@playwright/test';
import { registerAccount, test } from './fixtures';

test('registro, captura, audio, sincronización, reinicio y reconocimiento simulados', async ({ page }) => {
  const email = `demo-${Date.now()}@example.com`;
  await page.goto('/');
  await page.getByRole('link', { name: 'Abrir la aplicación' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'Registrate' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await registerAccount(page, email, 'demo-password-123');

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
  await expect(page.getByText(/no envía ni verifica archivos de audio/)).toBeVisible();
  const download = page.waitForEvent('download');
  await expect(page.getByText(/este ZIP contiene MP3 e instrucciones heredadas para DFPlayer/)).toBeVisible();
  await page.getByRole('button', { name: 'Descargar ZIP de MP3' }).click();
  expect((await download).suggestedFilename()).toBe('mitten-audios-mp3.zip');

  await page.getByRole('link', { name: 'Panel', exact: true }).click();
  await page.getByRole('button', { name: 'Reiniciar dispositivo simulado' }).click();
  await page.getByRole('button', { name: 'Simular reconocimiento' }).click();
  await expect(page.getByText(/Reconocimiento simulado: gesto/)).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('demo-password-123');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/gestures');
  await expect(page.getByText('Necesito agua', { exact: true })).toBeVisible();
});
