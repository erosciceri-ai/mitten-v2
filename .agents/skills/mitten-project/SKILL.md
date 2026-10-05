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

1. Localiza la raíz del repo: el directorio que contiene `.git`, `AGENTS.md`, `docs/`, `package.json`
   con `workspaces`. En esta máquina es `MITTENV2/v2/`. **`MITTENV2/mittenv1/` es histórico: no lo modifiques.**
2. Lee `AGENTS.md` de la raíz (551 líneas). Es la fuente principal de reglas persistentes: qué es
   MITTEN, qué tecnologías están cerradas, qué está prohibido.
3. Lee **sólo** los documentos de `docs/` que la tarea necesitaba (ver §1). No los recorras todos:
   `docs/protocol.md` son 1 768 líneas y `docs/architecture.md` 1 173; leerlos completos sin motivo
   cuesta mucho contexto y no aporta.
4. Verifica el estado real antes de asumir: `git status`, `git log --oneline -5`, `git branch --show-current`.

## 1. Jerarquía documental — qué documento governa qué

| Documento | Governa |
|---|---|
| `AGENTS.md` | Reglas persistentes del repositorio: stack cerrado, responsabilidades por subsistema, prohibido (reescritura masiva, `git reset --hard`, `monitor.py`, secrets commiteados, deps sin justificar). |
| `docs/protocol.md` | **Protocolo serie observable** (Protocol Version 2): framing NDJSON, envelopes, handshake, máquina de estados, captura, sincronización, códigos de error, límites. Canónico. |
| `docs/gesture-format.md` | **Formato de los gestos**: esquema `data` (`version = 1`, 7 dimensiones, `samples`, `summary`, metadatos), unidades, validación, `maxMessageBytes`. Canónico. |
| `docs/synchronization.md` | **Persistencia y sincronización interna del ESP32**: staging, commit atómico, recuperación en boot, garantías transaccionales. |
| `docs/architecture.md` | **Límites y responsabilidades entre subsistemas**: qué puede depender de qué, quién es fuente de verdad, flujos de alto nivel, límites de confianza. |
| `docs/requirements.md` | **Requisitos del producto**: REQ-\*\*\*, criterios CA-\*\*\*, restricciones y fuera de alcance. Responde el *qué*, no el *cómo*. |
| `docs/README.md` | Índice y regla de desempate entre documentos. |
| `docs/plan de accion.docx` | Diseño de MITTEN V1. **Sólo referencia histórica.** No define requisitos ni arquitectura de V2. |

**Regla de desempate** (`docs/README.md`): dentro de su ámbito, el documento especializado manda.
No apliques `requirements.md` como si fuera arquitectura, ni `architecture.md` como si fuera protocolo.

### Qué leer según la tarea

| Tarea | Documentos mínimos |
|---|---|
| Tocar framing, envelopes, handshake, estados, sync por serial, códigos de error | `protocol.md` + `AGENTS.md` |
| Tocar `data` de un gesto, `samples`, `summary`, unidades, validación de gesture | `gesture-format.md` + `protocol.md` (sólo handshake/capabilities) |
| Tocar persistencia del perfil en el ESP32, staging, commit, recuperación | `synchronization.md` + `protocol.md` §12 |
| Tocar rutas HTTP, auth, autorización, esquema de BD, límites de negocio | `architecture.md` §8 + `requirements.md` (REQ-BAC/REQ-USR/REQ-SEG) + `gesture-format.md` (qué se persiste) |
| Tocar la capa Web Serial del frontend | `protocol.md` (todo) + `architecture.md` §6 + `requirements.md` REQ-SER |
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
- **No introduzcas infraestructura.** Stack cerrado: MicroPython (firmware), Node+Express+TypeScript+
  **SQLite** (API), React+Vite+TypeScript (web). Nada de PostgreSQL, MongoDB, Redis, microservicios,
  Wi-Fi ESP32↔backend, bridge local ni `monitor.py`.
- **No cambies configuración ni instales dependencias** sin explicar antes qué problema resuelve y por
  qué el proyecto no tiene ya algo equivalente.
- **No commitees secretos.** Nunca `.env`, tokens, JWT secrets, contraseñas, API keys.

## 3. Después de modificar código

Ejecuta siempre, desde la raíz del repo:

```bash
npm test                                              # todos los workspaces
npm run build                                         # compila los workspaces
npm test --workspace=<el workspace que tocaste>       # el relevante primero
```

Reglas de validación específicas:

- **Protocolo o contratos**: los cambios en `packages/contracts` obligan a `npm test --workspace=packages/contracts`
  (149 tests) **y** a reconstruir (`npm run build --workspace=packages/contracts`) porque `apps/api` y
  `tools/esp32-simulator` consumen `dist/`, no el fuente.
- **Simulador**: `npm run build --workspace=tools/esp32-simulator && npm run simulator`. Ojo: `npm run
  simulator` de la raíz ejecuta `dist/` (puede estar stale); para probar el fuente usa
  `npm run dev --workspace=tools/esp32-simulator`.
- **Backend, paridad sql.js ↔ test store**: `apps/api/src/db/index.ts` tiene dos implementaciones de
  persistencia — el SQL real sobre `sql.js` y un *test store* en memoria para las pruebas. Casi todas
  las suites usan el test store. **Cualquier cambio de esquema, de la asignación first-fit de
  `audio_track`, o de los límites de 50 gestos debe aplicarse a las DOS**, o las pruebas pasan mientras
  producción se rompe. Verifica con un test que toque el SQL real (ver `__tests__/integration.test.ts`).
- **Firmware**: no hay runner de MicroPython instalado. Si escribes firmware, la validación disponible
  es el simulador y la revisión de que el código es MicroPython válido por lectura.
- **Frontend**: `apps/web` hoy no tiene `test` ni `build` en su `package.json`; si los agregás, avísame.

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
- `apps/api`: implementado y con tests, pero historically **sin versionar** — confirmá con `git status`.
- `apps/web` y `firmware/esp32`: vacíos salvo `package.json` / `.gitkeep`. Casi todo el trabajo
  restante está ahí.
- Rama activa: `master`, un solo commit. `mittenv1/` es un repo independiente aparte.

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