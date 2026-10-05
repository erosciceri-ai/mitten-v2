# MITTEN V2 — Formato de datos de gesto

## 1. Propósito

Este documento define el formato canónico de los datos físicos de un gesto (`data`), separado de sus metadatos, utilizado por:

```text
apps/web ↔ apps/api ↔ firmware/esp32 ↔ packages/contracts ↔ tools/esp32-simulator
```

El formato debe permitir implementar serialización, validación y reconocimiento en **TypeScript** y **MicroPython** sin ambigüedades.

No define:

- el algoritmo definitivo de reconocimiento;
- la API HTTP completa;
- el mecanismo físico de preparación de la microSD;
- la persistencia interna en el ESP32.

---

## 2. Separación metadatos / datos físicos

Un gesto completo está compuesto por dos partes independientes:

### 2.1. Metadatos del gesto (identidad y reproducción)

```json
{
  "id": 17,
  "name": "hola",
  "audioTrack": 17
}
```

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | integer | 1–2147483647; único dentro del perfil/usuario. Asignado por el backend. |
| `name` | string | 1–60 **puntos de código Unicode**; sin caracteres de control (U+0000–U+001F, U+007F). El nombre visible no es identidad técnica. |
| `audioTrack` | integer | 1–50 en Protocol Version 2; no define el nombre de archivo físico en la microSD. |

Estos campos **nunca** forman parte de `data`. Viajan en el envoltorio del protocolo (`sync.gesture` para sincronización; `capture.completed` devuelve solo `requestId` y `data`; los metadatos completos `id`, `name`, `audioTrack` se asignan en el backend y viajan en `sync.gesture`). Ver `docs/protocol.md`, secciones 11.5 y 12.5.

### 2.2. Datos físicos (`data`)

```json
{
  "version": 1,
  "dimensions": 7,
  "dimensionOrder": ["flex1","flex2","flex3","flex4","flex5","mpuX","mpuY"],
  "units": { "flex": "adc12", "mpu": "degrees" },
  "samples": [
    [3180.0, 3100.0, 2940.0, 3290.0, 3050.0, 12.3, -5.1],
    [3190.0, 3110.0, 2945.0, 3295.0, 3055.0, 12.2, -5.2],
    [3200.0, 3120.0, 2950.0, 3300.0, 3060.0, 12.1, -5.3]
  ],
  "summary": {
    "min": [3180.0, 3100.0, 2940.0, 3290.0, 3050.0, 12.1, -5.3],
    "max": [3200.0, 3120.0, 2950.0, 3300.0, 3060.0, 12.3, -5.1],
    "mean": [3190.0, 3110.0, 2945.0, 3295.0, 3055.0, 12.2, -5.2]
  },
  "sampleCount": 3,
  "captureDurationMs": 1500,
  "samplingPeriodMs": 100
}
```

---

## 3. Esquema de `data`

### 3.1. Definición completa

| Campo | Tipo | Obligatorio | Descripción |
|---|---|:---:|---|
| `version` | integer | Sí | Versión del formato `data`. Inicialmente `1`. |
| `dimensions` | integer | Sí | Número de dimensiones por muestra. Debe ser `7` en MITTEN V2. |
| `dimensionOrder` | array[string] | Sí | Nombres simbólicos en orden exacto de las 7 dimensiones. Valor fijo V2: `["flex1","flex2","flex3","flex4","flex5","mpuX","mpuY"]`. |
| `units` | object | Sí | Unidades por familia de sensor. Valor fijo V2: `{"flex":"adc12","mpu":"degrees"}`. |
| `samples` | array[array[number]] | Sí | Muestras crudas capturadas. Cada muestra es un array de 7 números en el orden de `dimensionOrder`. Longitud = `sampleCount`. |
| `summary` | object | Sí | Estadísticas precalculadas por el firmware para uso inmediato en reconocimiento. |
| `summary.min` | array[number] | Sí | Mínimo por dimensión (longitud 7). |
| `summary.max` | array[number] | Sí | Máximo por dimensión (longitud 7). |
| `summary.mean` | array[number] | Sí | Media aritmética por dimensión (longitud 7). |
| `sampleCount` | integer | Sí | Número de muestras (`samples.length`). Debe ser `≥ 1`. |
| `captureDurationMs` | integer | Sí | Duración real de la ventana de captura en milisegundos. `> 0`, `≤ 10000`. |
| `samplingPeriodMs` | integer | Sí | Período nominal entre muestras consecutivas en milisegundos. `> 0`, `≤ 1000`. |

### 3.2. Restricciones de consistencia

Todas las siguientes DEBEN cumplirse para un `data` válido:

1. `dimensions === dimensionOrder.length === 7`.
2. `samples.length === sampleCount`.
3. Para toda muestra `samples[k]`: `samples[k].length === dimensions`.
4. `summary.min.length === summary.max.length === summary.mean.length === dimensions`.
5. Para todo `i` en `0..6`: `min[i] ≤ mean[i] ≤ max[i]`.
6. Rangos físicos plausibles:
   - Dimensiones 0–4 (flex): `0 ≤ valor ≤ 4095` (ADC 12-bit raw).
   - Dimensiones 5–6 (MPU): `-180 ≤ valor ≤ 180` (grados).
7. `captureDurationMs > 0` y `captureDurationMs ≤ 10000`.
8. `samplingPeriodMs > 0` y `samplingPeriodMs ≤ 1000`.
9. `version === 1` (cualquier otro valor es inválido hasta que una especificación futura lo defina).

---

## 4. Unidades y convenciones numéricas

### 4.1. Sensores flex

- ADC de 12 bits del ESP32 configurado en atenuación 11 dB (rango aprox. 0–3.3 V).
- Valor raw `0–4095` sin escalar a voltios.
- Unidad declarada: `"adc12"`.

### 4.2. MPU6050

- Ángulos de inclinación (roll/pitch) en **grados decimales**.
- El firmware aplica offsets de calibración antes de almacenar.
- Unidad declarada: `"degrees"`.

### 4.3. Precisión

- TypeScript: `number` (IEEE-754 double).
- MicroPython: `float` (IEEE-754 single en la mayoría de puertos ESP32; precisión suficiente para 1 decimal en grados y entero en ADC).
- No se exige redondeo fijo; `summary.mean` conserva la precisión natural de la división.
- `samples` pueden contener valores enteros (flex) o con decimales (MPU).

---

## 5. Captura y generación de `data`

### 5.1. Responsabilidades del firmware

El firmware DEBE:

1. Capturar `sampleCount` muestras a intervalos nominales de `samplingPeriodMs`.
2. Aplicar calibración (offsets MPU) a cada muestra.
3. Calcular `min`, `max`, `mean` por dimensión.
4. Emitir `data` completo en el evento `capture.completed`.

El nombre del gesto **no** se incluye en `data`.

### 5.2. Parámetros de captura V2 (valores iniciales)

| Parámetro | Valor | Nota |
|---|---:|---|
| `samplingPeriodMs` | `100` | Heredado de V1 (~10 Hz). |
| `captureDurationMs` | `1500` | Duración nominal; el valor real se reporta en `captureDurationMs`. |
| `sampleCount` esperado | `15` | `captureDurationMs / samplingPeriodMs`; puede variar ±1 por scheduling. |

Estos valores son **configurables** y declarados en `data`; no son constantes del protocolo.

### 5.3. Comportamiento ante captura anómala

- Si el firmware no puede leer sensores: emite `capture.failed` con `SENSOR_ERROR`.
- Si `sampleCount === 0`: emite `capture.failed`.
- Si alguna muestra tiene `NaN` o lectura inválida: descarta la muestra y continúa; si el resultado queda con `sampleCount < 3`, emite `capture.failed`.
- Los timeouts y límites se anuncian en `capture.start` (`operationTimeoutMs`).

---

## 6. Validación en capas

| Capa | Qué valida | Acción si falla |
|---|---|---|
| **Protocolo** (`capture.completed`) | `data` es objeto; claves mínimas presentes | Frontend rechaza con `GESTURE_INVALID` local |
| **Frontend** (antes de POST `/gestos`) | Esquema completo (Zod/Valibot); rangos; consistencia de `name` y `data` | Muestra error al usuario; no envía al backend |
| **Backend** (POST `/gestos`) | Re-valida esquema completo de `name` y `data`; asigna `id` único y válido; `audioTrack` según política (OPEN DECISION) | HTTP 400 con `GESTURE_INVALID` |
| **Firmware** (`sync.gesture`) | Esquema completo; capacidad; IDs duplicados | Responde `GESTURE_INVALID` o `DUPLICATE_GESTURE_ID` |
| **Simulador** | Mismas reglas que firmware | Fixtures compartidas con `packages/contracts` |

El firmware **nunca** confía en que el frontend ya validó.

---

## 7. Almacenamiento y transporte

### 7.1. Backend (persistencia)

El backend persiste cada gesto almacenando **exclusivamente** el objeto `data` (sin `id`, `name`, `audioTrack`) junto con sus metadatos (`id`, `name`, `audioTrack`, `audio_archivo`, timestamps, etc.). La persistencia debe garantizar:

- fidelidad completa y sin pérdida de `data`;
- conservación de metadatos;
- posibilidad de reconstruir el gesto para sincronización.

SQLite está confirmado como tecnología de persistencia para MITTEN V2; el esquema concreto de tablas, columnas y representación interna de `data` es decisión de implementación del backend y no forma parte de este contrato.

### 7.2. Frontend → Backend (HTTP)

POST `/api/gestos`:

El body debe contener al menos los datos necesarios del gesto:

```json
{
  "name": "hola",
  "data": {}
}
```

El backend asigna un `id` único y válido, y persiste el gesto. La inclusión y asignación de `audioTrack` (rango 1–50) depende de la política de asignación/reutilización que es una **OPEN DECISION** (ver sección 9, decisión 5). `gesture-format.md` no define la API HTTP completa; la inclusión/asignación de `audioTrack` dependerá de la política que todavía está abierta.

### 7.3. Sincronización (`sync.gesture`)

El frontend transforma al formato de transporte:

```json
{
  "syncId": "sync-a1",
  "index": 0,
  "gesture": {
    "id": 17,
    "name": "hola",
    "audioTrack": 17,
    "data": {}
  }
}
```

El firmware valida `data` antes de staging.

### 7.4. ESP32 almacenamiento local

El perfil activo se almacena en un único archivo JSON: `gestures.json`. Durante una sincronización, el staging se realiza en `gestures.staging` (formato NDJSON: cabecera + un gesto JSON por línea). El commit es atómico: validar staging completo → generar `gestures.json.tmp` → cerrar/validar → `rename` atómico a `gestures.json` (LittleFS). El abort/timeout conserva el perfil anterior intacto. En boot: 1) `gestures.json` válido → cargar; 2) `.tmp` válido → recuperar; 3) ninguno válido → perfil vacío + error diagnóstico; 4) `.staging` huérfano → eliminar (nunca promover). La estrategia completa se documenta en `docs/synchronization.md`.

---

## 8. Compatibilidad TypeScript ↔ MicroPython

### 8.1. Contratos compartidos (`packages/contracts`)

Define para TypeScript:

- Esquema Zod/Valibot/JSON Schema de `data`.
- Validador runtime (`parse`, `safeParse`).
- Tipos TypeScript (`GestureData`, `GestureSummary`, etc.).
- Fixtures: `validGestureData`, `invalidGestureData[]`.

### 8.2. Implementación MicroPython

El firmware mantiene una implementación **equivalente**:

- Mismos nombres de campos y tipos.
- `json.loads()` / `json.dumps()` nativo.
- Validación imperativa equivalente (longitudes, rangos, `min ≤ mean ≤ max`).
- No importa TypeScript; se valida con los mismos fixtures serializados (JSON) cuando sea práctico.

### 8.3. Diferencias toleradas

- MicroPython `float` es single-precision; TypeScript `number` es double. La diferencia es irrelevante para los rangos y precisión requeridos.
- En `data.version = 1`, `samples` es obligatorio y `sampleCount ≥ 1` en todos los casos. Cualquier relajación requerirá una nueva versión del formato (`data.version = 2`).

---

## 9. OPEN DECISION

Las siguientes decisiones quedan abiertas y **no se inventan** en este documento:

1. **Algoritmo de reconocimiento definitivo**: V1 usa distancia normalizada al centro con rangos mínimos fijos (400 flex, 20 MPU) y **será el baseline inicial de V2**. V2 podrá adoptar DTW, k-NN, PCA, redes neuronales ligeras, etc., en fases posteriores. El formato `data` es agnóstico al algoritmo.
2. **Calibración y offsets**: si los offsets MPU y rangos de flex calibrados se almacenan dentro de `data` (campo `calibration`) o son estado separado del dispositivo consultable por `device.status`.
3. **Extensión a más dimensiones**: agregar giroscopio, acelerómetro raw, temperatura, etc. Requiere `data.version = 2`, nueva `dimensionOrder`, nuevo `units`.

---

### 9.1 Decisiones cerradas en este documento

**Persistencia ESP32 (antes decisión 2)**: Resuelta. Perfil activo en `gestures.json` (JSON único). Staging incremental en `gestures.staging` (NDJSON). Commit atómico vía `gestures.json.tmp` + `rename` (LittleFS). Recuperación en boot con prioridad: 1) `gestures.json` válido, 2) `.tmp` válido, 3) perfil vacío + error diagnóstico, 4) `.staging` huérfano → eliminar. `expectedGestureCount` solo existe durante SYNCING (estado transaccional), no se persiste. Ver `docs/synchronization.md`.

**Política de `audioTrack` (antes decisión 5)**: Resuelta. Rango 1–50, asignación first-fit por backend en creación, inmutable tras asignación. Al borrar gesto, track liberado y reutilizable. Al editar nombre, se regenera MP3 en la misma pista e invalida estado "audio preparado". Convención DFPlayer: `/mp3/{audioTrack:04d}.mp3`, reproducción mediante `playMp3Folder(audioTrack)`. Ver `docs/protocol.md` sección 12.5 y `docs/architecture.md` sección 11.

---

## 10. Incompatibilidades con MITTEN V1

| Aspecto | V1 (referencia) | V2 (este documento) |
|---|---|---|
| Identidad técnica | `nombre` (string) | `id` (integer, asignado por backend) |
| Versionado de `data` | No existe | `data.version` obligatorio |
| Estructura física | `min[7]`, `max[7]`, `prom[7]`, `muestras` (int) | `samples[][]` + `summary{min,max,mean}[7]` + metadatos de captura |
| Media | `prom` (1 decimal, float) | `mean` (precisión natural, float) |
| Unidades | Implícitas | Declaradas en `units` |
| Orden de dimensiones | Implícito por índice | `dimensionOrder` explícito |
| Metadatos de captura | No | `captureDurationMs`, `samplingPeriodMs` |
| Campo `tipo` | `"gesto"` | Eliminado (redundante) |
| Sync incluye audio/URL | Sí | Solo `audioTrack` (metadato); MP3 proceso separado |

El firmware V2 **no debe** generar formato V1. El backend V2 **no debe** aceptar `data` sin `version`.

---

## 11. Ejemplos completos

### 11.1. Gesto simple (3 muestras)

```json
{
  "version": 1,
  "dimensions": 7,
  "dimensionOrder": ["flex1","flex2","flex3","flex4","flex5","mpuX","mpuY"],
  "units": { "flex": "adc12", "mpu": "degrees" },
  "samples": [
    [3180.0, 3100.0, 2940.0, 3290.0, 3050.0, 12.3, -5.1],
    [3190.0, 3110.0, 2945.0, 3295.0, 3055.0, 12.2, -5.2],
    [3200.0, 3120.0, 2950.0, 3300.0, 3060.0, 12.1, -5.3]
  ],
  "summary": {
    "min": [3180.0, 3100.0, 2940.0, 3290.0, 3050.0, 12.1, -5.3],
    "max": [3200.0, 3120.0, 2950.0, 3300.0, 3060.0, 12.3, -5.1],
    "mean": [3190.0, 3110.0, 2945.0, 3295.0, 3055.0, 12.2, -5.2]
  },
  "sampleCount": 3,
  "captureDurationMs": 1500,
  "samplingPeriodMs": 100
}
```

### 11.2. Gesto con captura más larga (15 muestras)

```json
{
  "version": 1,
  "dimensions": 7,
  "dimensionOrder": ["flex1","flex2","flex3","flex4","flex5","mpuX","mpuY"],
  "units": { "flex": "adc12", "mpu": "degrees" },
  "samples": [
    [2100, 2050, 1980, 2150, 2000,  5.0, -2.0],
    [2120, 2060, 1990, 2160, 2010,  5.1, -2.1],
    [2140, 2070, 2000, 2170, 2020,  5.2, -2.0],
    [2130, 2065, 1995, 2165, 2015,  5.1, -1.9],
    [2110, 2055, 1985, 2155, 2005,  5.0, -2.0],
    [2105, 2052, 1982, 2152, 2002,  5.0, -2.1],
    [2115, 2058, 1988, 2158, 2008,  5.1, -1.9],
    [2125, 2062, 1992, 2162, 2012,  5.2, -2.0],
    [2135, 2068, 1998, 2168, 2018,  5.1, -2.1],
    [2120, 2060, 1990, 2160, 2010,  5.0, -2.0],
    [2110, 2055, 1985, 2155, 2005,  5.0, -2.0],
    [2100, 2050, 1980, 2150, 2000,  5.0, -2.0],
    [2095, 2048, 1978, 2148, 1998,  5.0, -1.9],
    [2090, 2045, 1975, 2145, 1995,  5.0, -2.0],
    [2085, 2042, 1972, 2142, 1992,  4.9, -2.1]
  ],
  "summary": {
    "min": [2085.0, 2042.0, 1972.0, 2142.0, 1992.0, 4.9, -2.1],
    "max": [2140.0, 2070.0, 2000.0, 2170.0, 2020.0, 5.2, -1.9],
    "mean": [2111.4, 2057.1, 1987.1, 2157.1, 2007.1, 5.04, -2.01]
  },
  "sampleCount": 15,
  "captureDurationMs": 1500,
  "samplingPeriodMs": 100
}
```

### 11.3. Inválido — `mean` fuera de rango

```json
{
  "version": 1,
  "dimensions": 7,
  "dimensionOrder": ["flex1","flex2","flex3","flex4","flex5","mpuX","mpuY"],
  "units": { "flex": "adc12", "mpu": "degrees" },
  "samples": [[3000,3000,3000,3000,3000,10,0]],
  "summary": {
    "min": [3000,3000,3000,3000,3000,10,0],
    "max": [3000,3000,3000,3000,3000,10,0],
    "mean": [3100,3000,3000,3000,3000,10,0]
  },
  "sampleCount": 1,
  "captureDurationMs": 100,
  "samplingPeriodMs": 100
}
```
→ Rechazado: `mean[0] > max[0]`.

### 11.4. Inválido — dimensión extra

```json
{
  "version": 1,
  "dimensions": 7,
  "dimensionOrder": ["flex1","flex2","flex3","flex4","flex5","mpuX","mpuY"],
  "units": { "flex": "adc12", "mpu": "degrees" },
  "samples": [[3000,3000,3000,3000,3000,10,0, 999]],
  "summary": { "min": [3000,3000,3000,3000,3000,10,0], "max": [3000,3000,3000,3000,3000,10,0], "mean": [3000,3000,3000,3000,3000,10,0] },
  "sampleCount": 1,
  "captureDurationMs": 100,
  "samplingPeriodMs": 100
}
```
→ Rechazado: `samples[0].length === 8 ≠ dimensions`.

---

## 12. Resumen del contrato

```text
data.version           = 1
data.dimensions        = 7
data.dimensionOrder    = [flex1,flex2,flex3,flex4,flex5,mpuX,mpuY]
data.units             = {flex: adc12, mpu: degrees}
data.samples           = array[array[number]]  (longitud = sampleCount)
data.summary.min/max/mean = array[number] (longitud 7)
data.sampleCount       = integer ≥ 1
data.captureDurationMs = integer > 0, ≤ 10000
data.samplingPeriodMs  = integer > 0, ≤ 1000

Validación: min ≤ mean ≤ max, rangos físicos, consistencia dimensional.

Metadatos (fuera de data): id, name, audioTrack

Relación con protocolo: `capture.completed.data` y cada `sync.gesture.gesture.data`
deben caber en un único frame ≤ `capabilities.maxMessageBytes` anunciado en handshake
(ver `docs/protocol.md`, secciones 4.5 y 8.2). El valor concreto de `maxMessageBytes`
queda como OPEN DECISION hasta mediciones reales en hardware.

OPEN DECISION: algoritmo, persistencia ESP32, calibración, audioTrack, extensiones.
```