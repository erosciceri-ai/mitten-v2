# MITTEN V2 — Índice de documentación

Este directorio contiene la especificación técnica de MITTEN V2.

## Documentos canónicos

| Documento | Ámbito | Autoridad |
|---|---|---|
| `requirements.md` | Qué debe hacer el sistema: requisitos funcionales, no funcionales, criterios de aceptación y restricciones de producto. | Requisitos de producto |
| `architecture.md` | Cómo está construido el sistema: componentes, responsabilidades, flujos de alto nivel, principios arquitectónicos y dependencias permitidas. | Arquitectura de alto nivel |
| `protocol.md` | Contrato canónico y autoritativo de la comunicación ESP32 ↔ frontend (Web Serial): transporte, framing, envelopes, handshake, estados, captura, sincronización, reconocimiento, errores y ejemplos. | Protocolo serie (wire protocol) |
| `gesture-format.md` | Contrato canónico y autoritativo de los datos físicos de un gesto (`data`): esquema, unidades, validación, almacenamiento, compatibilidad TypeScript/MicroPython y ejemplos. | Formato de gesto |

## Jerarquía de autoridad

- Dentro del ámbito del **protocolo serie** (wire format, handshake, estados, captura, sincronización, errores, `capabilities.maxMessageBytes`): **`protocol.md` manda**.
- Dentro del ámbito de la **estructura del gesto** (esquema `data`, unidades, validación, obligación de que un gesto pueda transportarse dentro de un frame permitido por `maxMessageBytes`): **`gesture-format.md` manda**.
- `requirements.md` establece **qué** debe hacer el sistema; `architecture.md` describe **cómo** está organizado; `protocol.md` y `gesture-format.md` definen los **contratos de intercambio** entre subsistemas.

## Documentación histórica (legacy)

- `plan de accion.docx` — Análisis y diseño de MITTEN V1. **Solo referencia histórica**; no define requisitos ni arquitectura de V2.
- La implementación V1 en `../mittenv1/` es referencia de comportamiento, no arquitectura a preservar.

## Documentos futuros (no existen aún)

Los siguientes se crearán cuando sea necesario:
- `calibration.md` — Offsets MPU, rangos flex, estrategia de calibración y persistencia.
- `synchronization.md` — Persistencia atómica interna en ESP32 (formato flash, recuperación ante corrupción).
- `development.md` — Guía de desarrollo, tooling, testing y contribución.

## Decisiones ya cerradas (no requieren nuevos documentos)

- Firmware: **MicroPython** en ESP32.
- Backend: **Node.js + Express + TypeScript + SQLite**.
- Frontend: **React + Vite + TypeScript**.
- Comunicación: **Web Serial API** (único propietario del puerto).
- Sin `monitor.py`, sin bridge local, sin Wi-Fi directo ESP32↔Backend.
- Protocolo: **Protocol Version 2** (NDJSON UTF-8 + LF).
- Sincronización: **reemplazo completo** transaccional (`sync.begin → sync.gesture × N → sync.commit/abort`).
- Estados oficiales: `INITIALIZING`, `CALIBRATING`, `IDLE`, `CAPTURING`, `SYNCING`, `ERROR`.
- Formato de gesto `data.version = 1`: 7 dimensiones, `samples`, `summary.min/max/mean`, `sampleCount`, `captureDurationMs`, `samplingPeriodMs`.
- `audioTrack` 1–50; política de asignación/reutilización **pendiente**.
- Reproducción de audio: **DFPlayer Mini** controlado directamente por firmware (UART).
- Algoritmo de reconocimiento inicial: **baseline de V1** (distancia normalizada a centro/rango); mejoras futuras no bloquean desarrollo.
- Datos de gestos V1: **solo prueba**; no se migran a V2; se recapturan en formato V2.
- Repositorio `mittenv1/`: **histórico independiente**; `v2/` es repositorio activo.

---

> **Nota**: Si detectas una contradicción entre documentos, el documento especializado manda dentro de su ámbito (ver tabla de autoridad arriba).