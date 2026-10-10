# MITTEN V2 — Índice de documentación

Este directorio contiene la especificación técnica de MITTEN V2.

## Documentos canónicos

| Documento | Ámbito | Autoridad |
|---|---|---|
| `requirements.md` | Qué debe hacer el sistema: requisitos funcionales, no funcionales, criterios de aceptación y restricciones de producto. | Requisitos de producto |
| `architecture.md` | Cómo está construido el sistema: componentes, responsabilidades, flujos de alto nivel, principios arquitectónicos y dependencias permitidas. | Arquitectura de alto nivel |
| `protocol.md` | Contrato canónico y autoritativo de la comunicación ESP32 ↔ frontend (Web Serial): transporte, framing, envelopes, handshake, estados, captura, sincronización, reconocimiento, errores y ejemplos. | Protocolo serie (wire protocol) |
| `gesture-format.md` | Contrato canónico y autoritativo de los datos físicos de un gesto (`data`): esquema, unidades, validación, compatibilidad TypeScript/MicroPython y ejemplos. | Formato de gesto |
| `synchronization.md` | Semántica transaccional de sincronización, staging, commit, abort, persistencia atómica y recuperación. | Sincronización y persistencia |

## Documentos operativos

- `google-authentication.md` — configuración, verificación y política de vinculación para Google Identity Services en MITTEN V2.1.
- `software-validation.md` — recorrido de validación sin hardware físico.
- `demo-software-mp3.md` — arranque único, modo demostración, Piper, paquete microSD y puerta de validación física.
- `development.md` — entorno local, comandos de desarrollo, validación y contribución.

## Jerarquía de autoridad

- Dentro del ámbito del **protocolo serie** (wire format, handshake, estados, captura, sincronización, errores, `capabilities.maxMessageBytes`): **`protocol.md` manda**.
- Dentro del ámbito de la **estructura del gesto** (esquema `data`, unidades, validación, obligación de que un gesto pueda transportarse dentro de un frame permitido por `maxMessageBytes`): **`gesture-format.md` manda**.
- `requirements.md` establece **qué** debe hacer el sistema; `architecture.md` describe **cómo** está organizado; `protocol.md` y `gesture-format.md` definen los **contratos de intercambio** entre subsistemas.
- Dentro del ámbito de la **sincronización transaccional y persistencia atómica del perfil en el dispositivo**: **`synchronization.md` manda**.

## Documentación histórica

- `legacy/mitten-v1-plan.docx` — análisis y diseño de MITTEN V1. **Solo referencia histórica**; no define requisitos ni arquitectura de V2.
- El código de MITTEN V1 se conserva fuera de este repositorio como referencia de comportamiento, no como arquitectura a preservar.

## Documentos futuros (no existen aún)

El siguiente se creará cuando sea necesario:
- `calibration.md` — Offsets MPU, rangos flex, estrategia de calibración y persistencia.

## Decisiones ya cerradas (no requieren nuevos documentos)

- Firmware: **MicroPython** en ESP32.
- Backend: **Node.js + Express + TypeScript + SQLite**.
- Frontend: **React + Vite + TypeScript**.
- Comunicación: **Web Serial API** (único propietario del puerto).
- Sin `monitor.py`, sin bridge local, sin Wi-Fi directo ESP32↔Backend.
- Protocolo: **Protocol Version 2** (NDJSON UTF-8 + LF).
- Sincronización: **reemplazo completo del perfil** mediante una transacción `sync.begin → sync.gesture × N → sync.commit/abort`; `sync.gesture × N` es el transporte, no sincronización incremental.
- Estados oficiales: `INITIALIZING`, `CALIBRATING`, `IDLE`, `CAPTURING`, `SYNCING`, `ERROR`.
- Formato de gesto `data.version = 1`: 7 dimensiones, `samples`, `summary.min/max/mean`, `sampleCount`, `captureDurationMs`, `samplingPeriodMs`.
- `audioTrack`: rango 1–50, independiente de `gesture.id`, asignación first-fit, estable mientras exista el gesto y reutilizable después de eliminarlo.
- Audio: `apps/api` genera o prepara los MP3; el frontend coordina; el ESP32 únicamente reproduce mediante DFPlayer Mini desde `/mp3/{audioTrack:04d}.mp3`.
- Algoritmo de reconocimiento inicial: **baseline de V1** (distancia normalizada a centro/rango); mejoras futuras no bloquean desarrollo.
- Datos de gestos V1: **solo prueba**; no se migran a V2; se recapturan en formato V2.
- Repositorio `mittenv1/`: **histórico independiente**; `v2/` es repositorio activo.
- `maxMessageBytes = 8192` bytes; V2 no implementa fragmentación.
- `recognition.detected` es el evento de reconocimiento; no existe estado persistente `RECOGNIZING`.
- La calibración MPU6050 pertenece al estado/configuración local del dispositivo, no a `GestureData`.
- `gesture.id` y `audioTrack` son inmutables mientras exista el gesto; `name`, `data` y el MP3 pueden actualizarse.
- Editar un gesto no implica sincronización incremental; la sincronización sigue siendo reemplazo completo.
- `packages/contracts` implementa los contratos compartidos usados por web, API y simulador, pero debe mantenerse alineado con estos documentos. Ante contradicción, el documento especializado correspondiente manda dentro de su ámbito.
---

> **Nota**: Si detectas una contradicción entre documentos, el documento especializado manda dentro de su ámbito (ver tabla de autoridad arriba).
