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

## Convenciones de cambios

- Mantén los cambios pequeños y enfocados.
- Añade pruebas de regresión para errores importantes.
- No cambies silenciosamente el protocolo serie ni el formato de gestos.
- Usa ramas creadas desde `main` y pull requests para integrar cambios publicados.
- Consulta [el índice documental](README.md) para identificar la fuente canónica de cada decisión.
