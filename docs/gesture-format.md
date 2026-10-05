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
  "audioTrack": 1
}
```

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | integer | 1–2147483647; único dentro del perfil/usuario. Asignado por el backend. |
| `name` | string | 1–60 **puntos de código Unicode**; sin caracteres de control (U+0000–U+001F, U+007F). El nombre visible no es identidad técnica. |
| `audioTrack` | integer | 1–50 en Protocol Version 2; asignado por el backend mediante first-fit; independiente de `gesture.id`; inmutable mientras exista el gesto; reutilizable después de eliminarlo. Convención DFPlayer: `/mp3/{audioTrack:04d}.mp3`. |

2.

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

`captureDurationMs` representa únicamente la duración de la ventana física de muestreo.

No debe confundirse con `operationTimeoutMs` del protocolo, que limita la duración total de la operación de captura incluyendo preparación, adquisición, procesamiento y emisión del evento terminal.

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

Los offsets de calibración del MPU6050 pertenecen al estado o configuración local del dispositivo.

NO forman parte de `GestureData`.

La calibración se realiza durante `CALIBRATING`, y los offsets deben aplicarse antes de producir los valores utilizados por captura y reconocimiento.

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

Estos son los parámetros iniciales de MITTEN V2.

Pueden ajustarse posteriormente mediante pruebas con el hardware real.

`captureDurationMs` y `samplingPeriodMs` se incluyen en `data` para registrar los valores efectivamente utilizados en cada captura.

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
| **Backend** (POST `/gestos`) | Re-valida esquema completo de `name` y `data`; asigna `id` único; asigna `audioTrack` first-fit dentro de 1–50; genera o prepara el MP3 asociado | HTTP 400 con `GESTURE_INVALID` cuando corresponde |
| **Firmware** (`sync.gesture`) | Esquema completo; capacidad; IDs duplicados | Responde `GESTURE_INVALID` o `DUPLICATE_GESTURE_ID` |
| **Simulador** | Mismas reglas que firmware | Fixtures compartidas con `packages/contracts` |

El firmware **nunca** confía en que el frontend ya validó.

---

## 7. Almacenamiento y transporte

### 7.1. Backend (persistencia)

El backend persiste el objeto `data` junto con los metadatos del gesto, incluyendo al menos `id`, `name` y `audioTrack`.

La representación concreta en SQLite, los nombres de columnas y cualquier metadato interno adicional son decisiones de implementación del backend y no forman parte de este contrato.

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

El backend asigna:

- un `id` único y válido;
- un `audioTrack` mediante first-fit dentro del rango `1..50`.

`audioTrack` es independiente de `gesture.id` y permanece inmutable mientras exista el gesto.

Cuando un gesto es eliminado, su `audioTrack` queda libre y puede reutilizarse posteriormente.

`gesture-format.md` no define la API HTTP completa; sólo establece las reglas de identidad y metadatos necesarias para mantener coherencia con el formato de gesto y el protocolo.

### 7.3. Sincronización (`sync.gesture`)

El frontend transforma al formato de transporte:

```json
{
  "syncId": "sync-a1",
  "index": 0,
  "gesture": {
    "id": 17,
    "name": "hola",
    "audioTrack": 1,
    "data": {}
  }
}
```

El firmware valida `data` antes de staging.

### 7.4. ESP32 — almacenamiento local

`GestureData` puede persistirse como parte del perfil local del dispositivo.

Este documento no define:

- nombres de archivos;
- staging físico;
- estrategia de doble buffer;
- rename;
- recuperación ante corrupción;
- activación atómica.

La semántica y estrategia de sincronización/persistencia del perfil están definidas en `docs/synchronization.md`.

La implementación DEBE preservar `data` sin modificar su estructura ni significado.

## 8. Compatibilidad TypeScript ↔ MicroPython

### 8.1. Contratos compartidos (`packages/contracts`)

`packages/contracts` implementa este formato canónico para TypeScript.
Debe proporcionar:
- Esquema Zod/Valibot/JSON Schema de `data`.
- Validador runtime (`parse`, `safeParse`).
- Tipos TypeScript (`GestureData`, `GestureSummary`, etc.).
- Fixtures: `validGestureData`, `invalidGestureData[]`.
- Ante una contradicción entre `packages/contracts` y este documento dentro del ámbito de `GestureData`, `docs/gesture-format.md` define el comportamiento esperado.

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

## 9. Decisiones aún abiertas

Las siguientes decisiones siguen abiertas y no cambian el contrato actual de `data.version = 1`.

1. **Algoritmo de reconocimiento definitivo**  
   El algoritmo V1 será el baseline inicial de MITTEN V2. Futuras mejoras pueden utilizar DTW, k-NN, PCA, redes neuronales ligeras u otros métodos, siempre que respeten el formato definido en este documento.

2. **Extensión a más dimensiones**  
   Agregar giroscopio, acelerómetro raw, temperatura u otras señales requeriría una nueva versión del formato, por ejemplo `data.version = 2`, junto con una nueva `dimensionOrder`, nuevas unidades y nuevas reglas de validación.
---

### 9.1. Decisiones cerradas

**Calibración MPU6050:**  
Los offsets pertenecen al estado/configuración local del dispositivo y NO forman parte de `GestureData`. Se aplican antes de generar los valores utilizados para captura y reconocimiento.

**Política de `audioTrack`:**  
Rango `1..50`, asignación first-fit por el backend, independiente de `gesture.id`, inmutable mientras exista el gesto y reutilizable después de eliminarlo.

**Audio:**  
`apps/api` genera o prepara el MP3 asociado al gesto. El frontend coordina y el ESP32 únicamente reproduce mediante DFPlayer Mini.

**Sincronización:**  
Editar `name`, `data` o regenerar un MP3 no implica sincronización incremental. La siguiente sincronización continúa siendo un reemplazo completo del perfil.

**Persistencia ESP32:**  
La estrategia de persistencia atómica y recuperación pertenece a `docs/synchronization.md` y no a este contrato de formato.
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

Relación con protocolo:
`capture.completed.data` y cada `sync.gesture.gesture.data`
deben caber dentro de un frame válido de Protocol Version 2.

maxMessageBytes = 8192 bytes

El límite corresponde al frame NDJSON completo codificado en UTF-8,
sin contar el byte LF final.

Calibración MPU:
estado/configuración local del dispositivo; no forma parte de GestureData.

Metadatos fuera de data:
id, name, audioTrack

audioTrack:
rango 1..50, first-fit, independiente de gesture.id e inmutable mientras exista el gesto.

Decisiones aún abiertas:
algoritmo de reconocimiento definitivo y posibles futuras extensiones de dimensiones.
```