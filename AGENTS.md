# MITTEN V2 — Instrucciones para Agentes de IA

## Propósito del proyecto

MITTEN es un guante electrónico wearable diseñado para traducir gestos de mano a audio hablado.

El sistema utiliza:

- 5 sensores flex para medir la flexión de los dedos.
- MPU6050 para medir orientación y movimiento de la mano.
- ESP32 ejecutando MicroPython.
- Una aplicación web para configuración, gestión de gestos y comunicación con el guante.
- Una API backend.
- Una interfaz web React.
- Generación de audio desde el backend y reproducción local en el dispositivo mediante DFPlayer Mini.

El repositorio actual contiene una implementación anterior de MITTEN V1.

**`mittenv1/`** queda como repositorio histórico de referencia. **`v2/`** es ahora el repositorio activo independiente.

MITTEN V1 debe tratarse como una implementación de referencia, **no** como la arquitectura que MITTEN V2 debe preservar.

El objetivo actual es el desarrollo incrementado en la rama `v2/`.

---

# Rama de desarrollo actual

El repositorio activo es MITTEN V2 y su rama principal es `main`.

Los cambios deben desarrollarse en ramas de trabajo breves y revisarse antes de integrarlos en
`main`. Si se usa un worktree, debe ser temporal, estar asociado a su propia rama y retirarse al
terminar.

MITTEN V1 es una referencia histórica externa y **no** debe recuperarse como arquitectura principal.

---

# Regla fundamental

NO realices una reescritura automática completa del repositorio.

MITTEN V2 debe reconstruirse incrementalmente.

Antes de hacer cambios arquitectónicos significativos:

1. Inspecciona el código existente relevante.
2. Explica el comportamiento actual.
3. Identifica el problema.
4. Propón el cambio.
5. Modifica solo los archivos requeridos.
6. Ejecuta las pruebas disponibles.
7. Verifica que el comportamiento esperado existente no se haya roto inadvertidamente.

Las reescrituras masivas sin control están prohibidas.

---

# Arquitectura objetivo

La dirección arquitectónica prevista para MITTEN V2 es:

```text
mitten/
│
├── apps/
│   ├── web/
│   │   └── React + Vite + TypeScript
│   │
│   └── api/
│       └── Node.js + Express + TypeScript
│
├── firmware/
│   └── esp32/
│       └── MicroPython
│
├── packages/
│   └── contracts/
│       └── Contratos, esquemas, validaciones y tipos compartidos entre frontend y backend
│
├── tools/
│   └── esp32-simulator/
│
├── docs/
│   ├── requirements.md
│   ├── architecture.md
│   ├── protocol.md
│   ├── gesture-format.md
│   ├── synchronization.md
│   └── README.md
│
├── AGENTS.md
└── README.md
```

Esta estructura es una dirección de diseño y puede ajustarse si hay una razón técnica clara.

No crees infraestructura innecesaria.

---

# Responsabilidades del sistema

El sistema debe tener responsabilidades claramente separadas.

## ESP32

Responsable de:

- Lectura de los 5 sensores flex.
- Lectura del MPU6050.
- Calibración de sensores.
- Adquisición de muestras de gestos.
- Reconocimiento local de gestos cuando sea necesario.
- Comunicación del estado del dispositivo mediante el protocolo serie.
- Recepción de comandos válidos desde el frontend vía Web Serial.
- Reproducción local del MP3 asociado a un gesto reconocido mediante DFPlayer Mini.

El ESP32 no genera archivos de audio ni asigna `audioTrack`; sólo reproduce pistas previamente preparadas y sincronizadas.

El ESP32 no debe contener lógica de gestión de aplicación que pertenezca al backend.

El firmware ejecuta **MicroPython** en el ESP32. MicroPython es la tecnología seleccionada para el firmware de MITTEN V2. El firmware monolítico de V1 es solo una referencia; el firmware V2 debe ser modular y mantenible.

---

## Web Serial

La comunicación entre la aplicación y el ESP32 se realiza mediante **Web Serial API desde el frontend React**.

- Web Serial es el único propietario del puerto serie en MITTEN V2.
- NO existirá `monitor.py`.
- NO existirá bridge local.
- NO habrá otro proceso de PC encargado del puerto COM.
- Toda la lógica de comunicación serie debe centralizarse en una única capa del frontend.
- Ninguna página o componente debe abrir independientemente el puerto serie.

---

## Backend API

Responsable de:

- Autenticación.
- Usuarios.
- Gestos.
- Metadatos de gestos.
- Persistencia.
- Validación.
- Lógica de aplicación relacionada con sincronización.
- Generación o preparación de archivos MP3 asociados a los gestos.
- Gestión de metadatos de audio y asignación de `audioTrack`.

El frontend solicita y coordina estas operaciones.
El ESP32 no genera audio; únicamente reproduce archivos MP3 previamente preparados desde la microSD mediante DFPlayer Mini.

La dirección técnica confirmada para MITTEN V2 es:

- **Node.js**
- **Express**
- **TypeScript**
- **SQLite**

SQLite es suficiente para el alcance actual del proyecto.

No introducir PostgreSQL, MongoDB, Redis, microservicios o infraestructura cloud compleja sin una necesidad futura demostrada.

---

## Frontend

Responsable de:

- Interfaz de usuario.
- Flujo de autenticación.
- Gestión de la biblioteca de gestos.
- Flujo de aprendizaje.
- Sincronización.
- Estado del dispositivo.
- Comunicación Web Serial.

La dirección técnica confirmada para MITTEN V2 es:

- **React**
- **Vite**
- **TypeScript**

La comunicación serie debe estar centralizada en una única capa del frontend. Ningún componente o página debe implementar conexiones serie independientes.

---

# Protocolo serie

El protocolo V2 está definido en `docs/protocol.md` (Protocol Version 2).

Características principales:

- Transporte: USB Serial 115200 baud, Web Serial API.
- Framing: NDJSON UTF-8 delimitado por LF.
- Envelopes: `request` (frontend→dispositivo), `response` (dispositivo→frontend), `event` (dispositivo→frontend).
- Correlación: `id` por request, `syncId` por transacción de sincronización.
- Handshake obligatorio: `device.handshake` valida identidad (`device === "MITTEN"`), `firmwareVersion`, `protocolVersion`, `capabilities.maxGestures`, `capabilities.maxMessageBytes`.
- Tamaño máximo de mensaje V2: `maxMessageBytes = 8192` bytes, incluido bootstrap/handshake. V2 no implementa fragmentación. Un mensaje mayor debe producir `MESSAGE_TOO_LARGE`.
- Estados oficiales: `INITIALIZING`, `CALIBRATING`, `IDLE`, `CAPTURING`, `SYNCING`, `ERROR`. `RECOGNIZING` no es estado persistente; el reconocimiento emite evento `recognition.detected` informativo.
- `ERROR` permite consultar `device.status`, pero las operaciones funcionales se rechazan con `INVALID_STATE`. La recuperación se realiza reiniciando el ESP32, que vuelve a comenzar en `INITIALIZING`.
- Captura: `capture.start` → fases `PREPARING`/`RECORDING`/`PROCESSING` → `capture.completed` (con `data`) o `capture.failed`.
- Sincronización transaccional: `sync.begin` → `sync.gesture × N` → `sync.commit` / `sync.abort`. Staging separado, perfil anterior conservado hasta commit.
- Timeouts V2: handshake 5000 ms, respuesta individual 5000 ms, captura 15000 ms, inactividad de sincronización 10000 ms y `sync.commit` 10000 ms. Cuando el dispositivo anuncie explícitamente un timeout aplicable, ese valor tiene prioridad para el frontend.
- Errores: códigos estables (`INVALID_JSON`, `UNKNOWN_COMMAND`, `INVALID_STATE`, `DEVICE_BUSY`, `PROFILE_TOO_LARGE`, `GESTURE_INVALID`, `DUPLICATE_GESTURE_ID`, `SYNC_INCOMPLETE`, `SYNC_TIMEOUT`, `SENSOR_ERROR`, `STORAGE_ERROR`, `INTERNAL_ERROR`, etc.).
- Simulador: mismo contrato observable que firmware real (`tools/esp32-simulator/`).
- Antes de completar el handshake, cualquier comando funcional o desconocido devuelve `HANDSHAKE_REQUIRED`. Después del handshake, un comando desconocido devuelve `UNKNOWN_COMMAND`.
- `DEVICE_BUSY` se usa cuando una operación normalmente válida no puede comenzar porque existe otra operación exclusiva activa. `INVALID_STATE` se usa cuando el estado actual no permite conceptualmente la operación.

No cambies el protocolo silenciosamente. Los cambios deben documentarse en `docs/protocol.md` y versionarse (Protocol Version).

La implementación anterior (V1) usaba mensajes tipo `STATUS:`, `JSON:`, `ERROR:`, `OK`, `GRABAR:` — solo referencia histórica.

---

# Datos de gestos

El formato canónico de los datos físicos de un gesto (`data`) está definido en `docs/gesture-format.md`.

Estructura V2 (`data.version = 1`):

- 7 dimensiones: `flex1..flex5` (ADC 12-bit raw, 0–4095), `mpuX`, `mpuY` (grados).
- `samples[n][7]`: muestras crudas capturadas.
- `summary.min/max/mean[7]`: estadísticas precalculadas por firmware.
- `sampleCount`, `captureDurationMs`, `samplingPeriodMs`: metadatos de captura.
- Unidades declaradas: `flex: adc12`, `mpu: degrees`.
La calibración del MPU6050 y sus offsets pertenecen al estado/configuración local del dispositivo, no a `GestureData`.
La calibración se realiza durante `CALIBRATING` y sus correcciones deben aplicarse antes de producir los valores normalizados usados para captura y reconocimiento.

La representación histórica V1 (`min[]`, `max[]`, `prom[]`, `muestras`, `nombre`, `tipo`) es solo referencia.

El reconocimiento de gestos históricamente utilizaba aproximadamente siete dimensiones derivadas de sensores flex e información IMU.

No asumas que el algoritmo de reconocimiento anterior es óptimo.

Antes de cambiar el reconocimiento de gestos:

1. Localiza la implementación real.
2. Documentala.
3. Construye pruebas usando muestras de gestos conocidas.
4. Compara el nuevo comportamiento contra la implementación anterior.

---
## Identidad y edición de gestos

Para un gesto existente:

- `gesture.id` es inmutable.
- `audioTrack` es inmutable mientras el gesto exista.
- `name` puede editarse.
- `data` puede editarse o reemplazarse mediante una nueva captura.
- El MP3 asociado puede regenerarse.
- Eliminar un gesto libera su `audioTrack`.
- Una pista liberada puede reutilizarse posteriormente mediante first-fit.

Editar un gesto en backend no implica sincronización incremental con el ESP32.
La siguiente sincronización continúa siendo un reemplazo completo del perfil.

# Diseño del firmware

Evita un único archivo grande de MicroPython.

El firmware debe separar progresivamente responsabilidades tales como:

```text
main.py
sensors.py
imu.py
calibration.py
gestures.py
recognition.py
protocol.py
storage.py
config.py
```

No dividas archivos solo por estética.

Los módulos deben corresponder a responsabilidades reales.

---

# Reglas de diseño del backend

Preferir:

- TypeScript.
- Servicios explícitos.
- Capa explícita de repositorios/acceso a datos.
- Validación de entrada.
- Configuración centralizada.
- Manejo centralizado de errores.
- Migraciones de base de datos.
- Pruebas automatizadas.

Evitar:

- URLs hardcodeadas.
- Secretos hardcodeados.
- SQL disperso en controladores.
- Lógica de negocio dentro de definiciones de rutas.
- Bloques catch silenciosos.
- Uso genérico de `any` sin justificación.

Los valores específicos de entorno deben usar variables de configuración/entorno.

---

# Reglas de diseño del frontend

Usar:

- React.
- Vite.
- TypeScript.

Preferir separación clara entre:

```text
components
pages
services
hooks
types
features
```

cuando esas divisiones aporten valor real.

Evita sobreingeniería.

No crees abstracciones usadas una sola vez a menos que mejoren significativamente la claridad.

El acceso a red debe ser centralizado.

No hardcodees:

```text
http://localhost:3000
```

en toda la aplicación.

Usa configuración de entorno.

---

# Estrategia de pruebas

MITTEN V2 debe incorporar pruebas automatizadas progresivamente.

Las pruebas deben ubicarse principalmente cerca del subsistema que prueban:

```text
apps/web/tests/
apps/api/tests/
firmware/esp32/tests/
tools/esp32-simulator/
```

No se exige una única carpeta raíz `tests/` obligatoria.

Flujos importantes a probar:

- Autenticación.
- Creación, edición, eliminación y listado de gestos.
- Sincronización de gestos.
- Parseo del protocolo serie.
- Manejo de estados del dispositivo.
- Reconocimiento de gestos.
- Mensajes inválidos del ESP32.
- Desconexiones y reconexiones.

Cuando se corrija un bug importante, añadir una prueba de regresión siempre que sea práctico.

---

# Simulador ESP32

El simulador del ESP32 es una **herramienta oficial del proyecto MITTEN V2**.
El simulador debe respetar los mismos límites observables que el firmware real, incluyendo `maxMessageBytes`, reglas de estado, prioridades de errores y timeouts definidos por Protocol Version 2.
Debe ubicarse conceptualmente en:

`tools/esp32-simulator/`

Su objetivo es permitir desarrollar y probar frontend y protocolo sin necesidad de tener conectado el guante físico.

Es capaz de simular:

- Conexión de dispositivo y handshake.
- Estados de calibración e inicialización.
- Muestras de sensores.
- Estados de grabación de gestos.
- Capturas exitosas de gestos.
- Eventos de reconocimiento.
- Errores de protocolo.
- Desconexiones del dispositivo.

No hacer que el desarrollo del frontend dependa permanentemente del hardware físico.

---

# Seguridad

Nunca hacer commit de:

- `.env`
- Tokens
- JWT secrets
- Contraseñas
- API keys
- Credenciales privadas

Tratar secretos existentes encontrados en el proyecto legacy como potencialmente comprometidos si han sido committeados a Git.

Validar toda entrada externa.

Autenticación y autorización deben probarse independientemente.

---

# Comportamiento con Git

Antes de cambios mayores:

- Verifica la rama actual.
- Inspecciona `git status`.
- Entiende las modificaciones existentes.

No descartes automáticamente cambios del usuario.

No ejecutes comandos destructivos de Git salvo que se solicite explícitamente.

Evita comandos tales como:

```text
git reset --hard
git clean -fd
```

a menos que el usuario los autorice explícitamente.

Haz cambios en grupos lógicos pequeños.

---

# Dependencias

Antes de instalar una dependencia:

1. Explica qué problema resuelve.
2. Verifica si el proyecto ya tiene una dependencia equivalente.
3. Prefiere librerías mantenidas y de uso común.
4. Evita añadir paquetes para funcionalidad trivial.

No instales frameworks grandes o infraestructura automáticamente.

---

# Prioridades de calidad de código

Orden de prioridad:

1. Corrección.
2. Simplicidad.
3. Mantenibilidad.
4. Testabilidad.
5. Arquitectura clara.
6. Rendimiento.
7. Abstracción.

No sacrifiques claridad por código ingenioso.

---

# Flujo de trabajo del agente IA

Para tareas sustanciales seguir:

```text
Inspeccionar
↓
Entender
↓
Planificar
↓
Implementar
↓
Probar
↓
Revisar
```

No saltees directamente de la solicitud del usuario a una implementación grande.

Cuando los requisitos sean inciertos, inspecciona primero la implementación legacy y la documentación del proyecto.

Cuando varias interpretaciones sean posibles, prefiere la arquitectura más simple consistente con los requisitos de MITTEN.

---

# Código legacy

El código legacy es evidencia de comportamiento previo.

**NO** es automáticamente una especificación de arquitectura correcta.

Al examinar código legacy distingue entre:

- Comportamiento requerido.
- Detalle accidental de implementación.
- Bugs.
- Deuda técnica.
- Código experimental.

Preserva el comportamiento requerido, no la deuda técnica innecesaria.

---

# Filosofía actual del proyecto

MITTEN es un proyecto de ingeniería escolar y un prototipo funcional.

El objetivo no es diseñar infraestructura a escala empresarial.

Las soluciones deben ser:

- Técnicamente sólidas.
- Comprensibles.
- Asequibles.
- Mantenibles por un equipo pequeño.
- Apropiadas para un ESP32 y una aplicación PC local.

Prefiere un sistema simple y correcto sobre uno impresionante pero innecesariamente complejo.

---

# Resumen de referencia documental

| Documento | Autoridad | Qué define |
|---|---|---|
| `docs/protocol.md` | **Canónica** | Wire protocol: transporte, handshake, estados, captura, sincronización, errores, ejemplos. |
| `docs/gesture-format.md` | **Canónica** | Formato `data`: esquema, unidades, validación, `maxMessageBytes`. |
| `docs/requirements.md` | Requisitos | Qué debe hacer el sistema, criterios de aceptación. |
| `docs/architecture.md` | Arquitectura | Componentes, responsabilidades, flujos alto nivel. |
| `docs/synchronization.md` | Sincronización | Flujo transaccional de sincronización de gestos. |
| `docs/README.md` | Índice | Jerarquía de autoridad y docs legacy. |

`packages/contracts` es la implementación compartida de contratos, tipos y validaciones usada por web, API y simulador, y referencia ejecutable para firmware.
Debe mantenerse alineado con los documentos canónicos. Ante una contradicción, el documento especializado correspondiente define el comportamiento esperado dentro de su ámbito.

## Estados oficiales del firmware (Protocol Version 2)

| Estado | Significado |
|---|---|
| `INITIALIZING` | Firmware preparando servicios y almacenamiento. |
| `CALIBRATING` | Calibrando sensores. |
| `IDLE` | Sin operación exclusiva; acepta captura o sincronización. |
| `CAPTURING` | Captura de gesto en curso. |
| `SYNCING` | Transacción de sincronización en staging. |
| `ERROR` | Fallo que impide operar con seguridad. |

- `DISCONNECTED` es estado local del frontend (sin sesión Web Serial).
- `RECOGNIZING` **no existe** como estado persistente; reconocimiento ocurre en `IDLE` y notifica vía `recognition.detected`.
- Fases de captura (`PREPARING`, `RECORDING`, `PROCESSING`) son eventos de progreso, no estados.
- La lista normativa está en `docs/protocol.md`, sección 9.

## Decisiones ya cerradas (no modificar sin versionar protocolo cuando corresponda)

- Protocol Version 2, NDJSON UTF-8 + LF.
- Handshake `device.handshake` con bootstrap estable.
- Campos del wire protocol en camelCase, incluyendo `firmwareVersion` y `protocolVersion`.
- Correlación por `id` (request) y `syncId` (sincronización).
- `maxMessageBytes = 8192` bytes. El límite aplica también durante bootstrap. V2 no usa fragmentación.
- Sincronización transaccional `sync.begin → sync.gesture × N → sync.commit/abort`.
- La semántica de sincronización es reemplazo completo del perfil; `sync.gesture × N` es únicamente el transporte dentro de esa transacción.
- El staging nunca sustituye al perfil activo antes de un `sync.commit` exitoso.
- `state === SYNCING` implica que existe una transacción `activeSync`.
- Reemplazo completo con conservación del perfil anterior ante abort, timeout o fallo.
- `data.version = 1`: 7 dimensiones, `samples`, `summary.min/max/mean`, `sampleCount`, `captureDurationMs`, `samplingPeriodMs`.
- La calibración MPU6050 pertenece al estado/configuración local del dispositivo y no a `GestureData`.
- `audioTrack` 1–50: independiente de `gesture.id`, asignación first-fit, inmutable mientras exista el gesto y reutilizable después de eliminarlo.
- DFPlayer usa `/mp3/{audioTrack:04d}.mp3`.
- `apps/api` genera o prepara los archivos MP3. El frontend coordina y el ESP32 únicamente reproduce.
- `gesture.id` es inmutable.
- `gesture.name` y `gesture.data` son editables; el MP3 puede regenerarse.
- Editar un gesto no implica sincronización incremental.
- `recognition.detected` es un evento oficial V2 emitido durante `IDLE`; no existe estado persistente `RECOGNIZING`.
- En `ERROR`, sólo operaciones permitidas por protocolo como `device.status` continúan disponibles; las operaciones funcionales se rechazan con `INVALID_STATE`. La recuperación requiere reinicio del ESP32.
- Antes del handshake, los comandos funcionales o desconocidos producen `HANDSHAKE_REQUIRED`; después del handshake los desconocidos producen `UNKNOWN_COMMAND`.
- `DEVICE_BUSY` representa una operación exclusiva actualmente ocupada; `INVALID_STATE`, un estado conceptualmente incompatible.
- `capture.start` reserva internamente la operación antes de responder `accepted:true`.
- `gesture.name` admite como máximo 60 Unicode code points y sigue sujeto al límite global de 8192 bytes por mensaje.
- Timeouts V2:
  - handshake frontend: 5000 ms.
  - respuesta individual: 5000 ms.
  - captura: 15000 ms.
  - inactividad de sincronización: 10000 ms.
  - `sync.commit`: 10000 ms.
- Cuando el dispositivo anuncie explícitamente un timeout aplicable, el frontend debe respetar el valor anunciado.
- El algoritmo de reconocimiento V1 será el baseline inicial de V2; el algoritmo definitivo podrá mejorarse después.
- `docs/synchronization.md` forma parte de la jerarquía documental y es el documento especializado para sincronización/persistencia atómica.
