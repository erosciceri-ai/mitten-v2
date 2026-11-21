---
name: mitten-project
description: "Use when working on any MITTEN V2 task — protocol, gesture data, sync, backend, web, firmware or simulator. Points to the canonical doc per subsystem, mandates minimal scoped changes, and defines what to report back."
license: MIT
metadata:
  project: "MITTEN V2"
  repo_root: "v2/"
  scope: "apps/web, apps/api, firmware/esp32, packages/contracts, tools/esp32-simulator, docs/"
---

# MITTEN V2 — Flujo de trabajo del proyecto

Esta skill define **cómo** trabajar en MITTEN V2. **No** repite las reglas del proyecto: esas ya están en
los documentos canónicos, y cada uno manda dentro de su ámbito.

Si algo aquí contradice a un documento canónico, **manda el documento**.

## 0. Antes de tocar nada

1. Verifica primero el estado incremental:
   `git branch --show-current`, `git status --short` y `git diff --name-only`.

2. `AGENTS.md` sigue siendo autoridad persistente, pero no lo releas completo por defecto.
   Consulta únicamente las secciones relevantes para la tarea mediante búsqueda dirigida.

3. Lee sólo los documentos de `docs/` relacionados directamente con el subsistema afectado.

4. Inspecciona primero los archivos modificados o directamente involucrados.
   No vuelvas a auditar subsistemas ya validados si no cambiaron.

## 1. Jerarquía documental — qué documento governa qué

| Documento | Governa |
|---|---|
| `AGENTS.md` | Reglas persistentes del repositorio: stack cerrado, responsabilidades por subsistema, prohibido (reescritura masiva, `git reset --hard`, `monitor.py`, secrets commiteados, deps sin justificar). |
| `docs/protocol.md` | **Protocolo serie/relay observable** (Protocol Version 2): framing NDJSON, envelopes, handshake, máquina de estados, captura, sincronización, comandos `audio.*`, códigos de error, límites. Canónico. |
| `docs/gesture-format.md` | **Formato de los gestos**: esquema `data` (`version = 1`, 7 dimensiones, `samples`, `summary`, metadatos), unidades, validación, `maxMessageBytes`. Canónico. |
| `docs/synchronization.md` | **Persistencia y sincronización interna del ESP32**: staging, commit atómico, recuperación en boot, garantías transaccionales. |
| `docs/audio-transfer.md` | **Transferencia de audio (`audio.*`)**: conversión MP3→WAV en el navegador, carga por chunks base64, verificación SHA-256 y manifiesto en microSD. |
| `docs/persistence.md` | **Persistencia backend**: abstracción `DatabaseClient`, soporte dual SQLite (`DB_PROVIDER=sqlite`) / PostgreSQL (`DB_PROVIDER=postgres`) y migraciones `001`–`003`. |
| `docs/audio-storage.md` | **Almacenamiento de audio backend**: abstracción `AudioStorage` (`AUDIO_STORAGE_PROVIDER=local|s3`) y configuración de bucket S3 compatible. |
| `docs/firmware-audio-migration.md` | **Audio en firmware**: reproducción WAV por microSD SPI + MAX98357A I²S, retiro de DFPlayer y estado de validación física pendiente. |
| `docs/deployment.md` | **Despliegue de producción**: topología (Cloudflare Pages, Render, Neon, S3), variables de entorno y checklist de release. |
| `docs/deployment/phase5.md` | **Runbook de Fase 5**: guía operativa paso a paso para puesta en marcha de producción y pruebas de humo. |
| `docs/architecture.md` | **Límites y responsabilidades entre subsistemas**: qué puede depender de qué, quién es fuente de verdad, flujos de alto nivel, límites de confianza. |
| `docs/requirements.md` | **Requisitos del producto**: REQ-\*\*\*, criterios CA-\*\*\*, restricciones y fuera de alcance. Responde el *qué*, no el *cómo*. |
| `docs/README.md` | Índice y regla de desempate entre documentos. |

**Regla de desempate** (`docs/README.md`): dentro de su ámbito, el documento especializado manda.
No apliques `requirements.md` como si fuera arquitectura, ni `architecture.md` como si fuera protocolo.

### Qué leer según la tarea

| Tarea | Documentos mínimos |
|---|---|
| Tocar framing, envelopes, handshake, estados, sync por serial/relay, códigos de error | `protocol.md` + `AGENTS.md` |
| Tocar `data` de un gesto, `samples`, `summary`, unidades, validación de gesture | `gesture-format.md` + `protocol.md` (sólo handshake/capabilities) |
| Tocar persistencia del perfil en el ESP32, staging, commit, recuperación | `synchronization.md` + `protocol.md` §12 |
| Tocar carga de audio al guante (`audio.*`), conversión WAV o reproducción SPI/I²S | `audio-transfer.md` + `protocol.md` §12.12 + `firmware-audio-migration.md` |
| Tocar rutas HTTP, auth, autorización, esquema de BD, almacenamiento de audio, límites de negocio | `architecture.md` §8 + `persistence.md` + `audio-storage.md` + `requirements.md` (REQ-BAC/REQ-USR/REQ-SEG) + `gesture-format.md` |
| Tocar la capa de transporte del frontend (Web Serial / Wi-Fi relay / Demo) | `protocol.md` (todo) + `architecture.md` §6 + `requirements.md` REQ-SER |
| Tocar despliegue, variables de entorno de producción o smoke tests de release | `deployment.md` + `deployment/phase5.md` + `persistence.md` + `audio-storage.md` |
| Tocar el simulador | `protocol.md` — el simulador debe ser indistinguible del firmware real |
| Agregar o cambiar un mensaje/estado/error del protocolo | `protocol.md` + **bump de `PROTOCOL_VERSION`** + actualizar `packages/contracts` |

## 2. Reglas de cambio

- **No inventes decisiones de producto.** Si dos documentos se contradicen, o si la tarea requiere una
  decisión que nadie tomó, **detente y repórtala** con: documento A + cita, documento B + cita, y las
  opciones reales. No elijas por tu cuenta.
- **Cambios mínimos y acotados.** Modifica sólo los archivos que la tarea requiere. Nada de refactors
  oportunistas, renombres massive, ni "de paso limpio esto".
- **No hagas commits** salvo instrucción explícita del usuario. Si pide commit, uno solo y con mensaje
  claro.
- **Preserva los cambios existentes del usuario.** Antes de editar, `git status` y `git diff`. Nunca
  `git reset --hard`, `git checkout --`, `git clean -fd` ni descartar trabajo no commiteado.
- **No introduzcas infraestructura fuera del alcance aprobado.** Stack cerrado: MicroPython (firmware),
  Node+Express+TypeScript con **SQLite o PostgreSQL** (`DB_PROVIDER=sqlite|postgres`) y almacenamiento de audio
  **local o S3 compatible** (`AUDIO_STORAGE_PROVIDER=local|s3`) en la API, React+Vite+TypeScript (web), y
  transporte dual **Web Serial USB** (`TRANSPORT_MODE="serial"`) o **Wi-Fi relay opcional** vía `/ws/web` y
  `/ws/device` (`TRANSPORT_MODE="relay"`). Nada de MongoDB, Redis, microservicios, bridge local ni `monitor.py`.
- **No cambies configuración ni instales dependencias** sin explicar antes qué problema resuelve y por
  qué el proyecto no tiene ya algo equivalente.
- **No commitees secretos.** Nunca `.env`, tokens, JWT secrets, contraseñas, API keys.

## 3. Después de modificar código

Usa validación escalonada.

### Fase A — durante implementación

Ejecuta únicamente los tests directamente relacionados con el cambio.

### Fase B — al estabilizar el cambio

Ejecuta:

- tests del workspace afectado;
- build del workspace afectado.

### Fase C — cierre

Ejecuta tests/build globales sólo si:

- se modificó `packages/contracts`;
- cambió el protocolo;
- el cambio afecta varios workspaces;
- existe riesgo de regresión transversal;
- se está cerrando una etapa importante antes de integración.

No ejecutes todos los tests del monorepo después de cada modificación pequeña.

Reglas de validación específicas:

- **Protocolo o contratos**: los cambios en `packages/contracts` obligan a `npm test --workspace=packages/contracts`
  **y** a reconstruir (`npm run build --workspace=packages/contracts`) porque `apps/api` y
  `tools/esp32-simulator` consumen `dist/`, no el fuente.
- **Simulador**: `npm run build --workspace=tools/esp32-simulator && npm run simulator`. Ojo: `npm run
  simulator` de la raíz ejecuta `dist/` (puede estar stale); para probar el fuente usa
  `npm run dev --workspace=tools/esp32-simulator`.
- **Backend**: soporta ejecución dual SQLite (`DB_PROVIDER=sqlite`) y PostgreSQL (`DB_PROVIDER=postgres`),
  migraciones transaccionales `001`–`003`, almacenamiento de audio `AudioStorage` (`local` o `s3`),
  endpoints de dispositivos (`/api/device`) y relay WebSocket (`/ws/web`, `/ws/device`). Con `NODE_ENV=test`
  y `DB_PROVIDER=sqlite`, la base siempre es `:memory:` y el audio usa un directorio temporal, aunque se
  herede `DB_PATH`. Ejecuta las pruebas de migración, rollback, first-fit, pairing y relay.
- **Firmware**: el núcleo y los drivers inyectables tienen tests en CPython/pytest:
  `python -B -m pytest firmware/esp32/tests -q -p no:cacheprovider`.
  Cada prueba usa almacenamiento temporal. Esto no sustituye las pruebas de MicroPython,
  periféricos, memoria y cortes de alimentación en la placa real.
- **Frontend**: `apps/web` tiene `test` (vitest) y `build` (tsc + vite build) en su `package.json`; los tests cubren `SerialTransport`, `RelayTransport`, `DemoTransport`, `RequestManager`, `DevicePairingCard`, `PairedDevicesPanel`, `GloveAudioPanel`, `ConnectionBanner` y `gloveWav`, además de la suite E2E con Playwright (`npm run test:e2e`).

## 4. Paralelismo

- **Tareas de análisis o revisión**: paralelizables con subagentes (lectura independiente, sin
  escritura).
- **Tareas de código realmente paralelas**: usá **git worktrees separados**, un worktree por tarea, con
  su propia rama. Nunca dos sesiones de OpenCode sobre el mismo directorio de trabajo.
- Dos tareas que tocan `packages/contracts` **no** pueden ir en paralelo: todo lo demás depende de su
  `dist/`.

## 5. Qué reportar al terminar

Siempre, en este orden:

1. **Causa raíz** — por qué existía el problema, en una frase. Si no investigaste la causa, decilo.
2. **Archivos modificados** — ruta por ruta, y qué cambió en cada uno.
3. **Pruebas ejecutadas** — comando y resultado real. Si no corriste las pruebas, decilo; no insinúes
   que pasaron.
4. **Pendientes y riesgos** — lo que quedó sin hacer, lo que no pudiste verificar, y las contradicciones
   documentales que encontraste (con citas, sin resolverlas por tu cuenta).

Distinguí siempre entre:
- **documentado** (está en un texto canónico, con cita),
- **implementado** (está en el código),
- **inferido** (tu conclusión razonada).

## 6. Estado actual del repo (verificar, no asumir)

- `packages/contracts` y `tools/esp32-simulator`: implementados, con tests, commiteados.
- `apps/api`: Express/TypeScript con soporte dual SQLite/PostgreSQL (`DB_PROVIDER=sqlite|postgres`), migraciones `001`–`003`, `AudioStorage` (`local|s3`), `/api/device` y WebSocket relay (`/ws/web`, `/ws/device`), con tests Vitest; confirmar cambios pendientes con Git.
- `apps/web`: React/Vite/TypeScript, tests Vitest (`SerialTransport`, `RelayTransport`, `DemoTransport`, `RequestManager`, `DevicePairingCard`, `PairedDevicesPanel`, `GloveAudioPanel`, `ConnectionBanner`, `gloveWav`) y suite E2E Playwright.
- `firmware/esp32`: núcleo modular, captura, sincronización recuperable, baseline V1, almacenamiento WAV (`audio_store.py`), reproductor SPI/I²S (`audio.py`), provisión Wi-Fi (`wifi_manager.py`), transporte relay (`relay_transport.py`) y drivers ADC/I2C/UART inyectables. `hardware_config.example.py` enumera los datos físicos pendientes; no asumir GPIO ni atenuación. El provider TTS `mock` no produce audio ni lo marca listo.

Trabaja en una rama breve creada desde `main`. Para tareas paralelas, usa un worktree temporal por
rama y retíralo después de integrar el cambio.

Verifica siempre mediante:

`git branch --show-current`

No implementes cambios directamente sobre `main` salvo autorización explícita del usuario.

## 7. Comandos de referencia

```bash
npm test && npm run build
npm test --workspace=packages/contracts
npm test --workspace=tools/esp32-simulator
npm test --workspace=apps/api
npx tsc --noEmit -p packages/contracts/tsconfig.json
git status && git diff
```

`npm run lint` de la raíz es un **no-op**: se propaga con `--if-present` y ningún workspace define
`lint`. No lo reportes como validación.
