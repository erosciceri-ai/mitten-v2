# Guía de desarrollo

Esta guía describe el entorno mínimo para trabajar con MITTEN V2 sin hardware físico.

## Requisitos

- Node.js 20.17.0 o superior dentro de la línea compatible indicada en `package.json`.
- npm.
- Python 3.11 o superior con `pytest` para las pruebas del firmware.
- Chrome o Edge para las funciones Web Serial.

## Preparación

```bash
npm ci
```

Copia los archivos de configuración de ejemplo y completa únicamente los valores locales necesarios:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Nunca incluyas en Git archivos `.env`, bases SQLite, audio generado ni perfiles locales del firmware.

## Desarrollo local

```bash
# API
npm run dev --workspace=apps/api

# Web, en otra terminal
npm run dev --workspace=apps/web
```

La API escucha por defecto en `http://localhost:3000` y la web en `http://localhost:5173`.

## Validación

```bash
npm test
npm run build
python -B -m pytest firmware/esp32/tests -q -p no:cacheprovider
npm audit --omit=dev
```

Los cambios en `packages/contracts` requieren reconstruir el paquete antes de probar consumidores que usen `dist/`.

### Ejecución focalizada

Durante un cambio, ejecutá primero el archivo o subsistema afectado. La selección local no reemplaza la validación completa antes de integrar.

```bash
# Lógica serie: los tres archivos sin DOM usan Node
npm test --workspace=apps/web -- src/serial/RequestManager.test.ts src/serial/DeviceService.test.ts src/serial/DemoTransport.test.ts

# Integración de persistencia y asignación de pistas
npm test --workspace=apps/api -- src/models/persistence.test.ts

# Contratos: reconstruir antes de probar API/simulador que consumen dist
npm test --workspace=packages/contracts
npm run build --workspace=packages/contracts

# Firmware: seleccionar un archivo, o toda la carpeta para la suite completa
python -B -m pytest firmware/esp32/tests/test_sync_commands.py -q -p no:cacheprovider

# Navegador: requiere el Chromium correspondiente a Playwright instalado
npm run test:e2e --workspace=apps/web -- visual-accessibility.spec.ts
```

La [revisión de la suite](testing-audit.md) distingue pruebas eliminadas, consolidadas, corregidas y mantenidas, con sus motivos. `npm test` conserva todas las suites JavaScript configuradas; firmware y navegador se ejecutan por separado.

## Organización de archivos de prueba

- En TypeScript, coloca las pruebas unitarias junto al módulo que prueban, con sufijo
  `.test.ts` o `.test.tsx`. Por ejemplo: `serial/SerialTransport.ts` y
  `serial/SerialTransport.test.ts`.
- Reserva `src/test/` para configuración y utilidades compartidas de pruebas.
- Los recorridos de navegador viven en `apps/web/e2e/`; las pruebas del firmware,
  en `firmware/esp32/tests/`.
- No separes módulos en nuevas carpetas sólo por estética: agrupa por una responsabilidad
  concreta. Los archivos `.gitkeep` sólo son necesarios mientras una carpeta esté vacía.

## Convenciones de cambios

- Mantén los cambios pequeños y enfocados.
- Añade pruebas de regresión para errores importantes.
- No cambies silenciosamente el protocolo serie ni el formato de gestos.
- Usa ramas creadas desde `main` y pull requests para integrar cambios publicados.
- Consulta [el índice documental](README.md) para identificar la fuente canónica de cada decisión.
