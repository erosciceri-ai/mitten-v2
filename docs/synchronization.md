# MITTEN V2 — Persistencia atómica y sincronización en ESP32

## 1. Propósito

Este documento define la estrategia de persistencia local de gestos en el ESP32 (MicroPython), incluyendo:

- Formato del perfil activo (`gestures.json`).
- Staging transaccional durante `sync.begin → sync.gesture × N → sync.commit/abort`.
- Commit atómico y recuperación ante fallos/cortes de energía.
- Comportamiento en boot ante corrupción o transacciones incompletas.

La semántica externa del protocolo de sincronización (`sync.begin`, `sync.gesture`, `sync.commit`, `sync.abort`, `device.status`, códigos de error) está definida en `docs/protocol.md`, sección 12. Este documento cubre la **implementación interna** en el firmware.

---

## 2. Archivos involucrados

| Archivo | Propósito | Ciclo de vida |
|---------|-----------|---------------|
| `gestures.json` | Perfil activo persistido (única fuente de verdad en ESP32). | Creado/actualizado solo en `sync.commit` exitoso. Sobrevive a reinicios. |
| `gestures.json.tmp` | Archivo intermedio de commit atómico. | Creado durante `sync.commit`, renombrado a `gestures.json` atómicamente. |
| `gestures.staging` | Staging transaccional (NDJSON). | Creado en `sync.begin`, escrito incrementalmente en `sync.gesture`, eliminado en `sync.commit` (tras éxito) o `sync.abort`/timeout/error. |
Dentro de un mismo perfil, tanto `gesture.id` como `audioTrack` deben ser únicos.

Los valores de `audioTrack` pertenecen a la biblioteca del perfil sincronizado. Distintos perfiles pueden reutilizar los mismos números de pista, ya que el ESP32 mantiene un único perfil activo a la vez.

`gesture.id` y `audioTrack` son identidades independientes y no deben asumirse iguales.

**Regla de oro**: En cualquier momento, `gestures.json` es el único perfil válido. `gestures.staging` y `gestures.json.tmp` son transitorios y **nunca** se exponen como perfil activo.

---

## 3. Formato del perfil activo (`gestures.json`)

```json
{
  "version": 1,
  "profileId": "profile-42",
  "profileRevision": "rev-7",
  "gestureCount": 2,
  "gestures": [
    {
      "id": 17,
      "name": "hola",
      "audioTrack": 17,
      "data": { ... }
    },
    {
      "id": 23,
      "name": "gracias",
      "audioTrack": 23,
      "data": { ... }
    }
  ]
}
```

**Campos:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `version` | integer | Versión del formato de persistencia (inicialmente `1`). |
| `profileId` | string | Identificador opaco del perfil (viene de `sync.begin`). |
| `profileRevision` | string | Revisión opaca del perfil (viene de `sync.begin`). |
| `gestureCount` | integer | Número de gestos en el array `gestures`. Debe coincidir con `len(gestures)`. |
| `gestures` | array | Lista de gestos completos (metadatos + `data`). Orden = índice de sincronización (0..N-1). |

> **Nota**: `expectedGestureCount` **no se persiste**. Solo existe como variable en RAM durante la transacción SYNCING. Tras un commit exitoso, `gestureCount == expectedGestureCount` por construcción.

---

## 4. Staging transaccional (`gestures.staging`)

### 4.1 Formato (NDJSON)

El staging se escribe **incrementalmente**, una línea por gesto, para minimizar uso de RAM (heap MicroPython).

```
{"version":1,"profileId":"profile-42","profileRevision":"rev-7","expectedGestureCount":2}
{"id":17,"name":"hola","audioTrack":17,"data":{...}}
{"id":23,"name":"gracias","audioTrack":23,"data":{...}}
```

- **Línea 1 (cabecera)**: JSON con metadatos de la transacción (`expectedGestureCount` incluido).
- **Líneas 2..N+1**: Un gesto JSON completo por línea (el mismo objeto que viaja en `sync.gesture.gesture`).
- **Sin comas finales**, sin array contenedor. Cada línea es JSON válido independiente.

### 4.2 Algoritmo de staging

**Estado en RAM durante SYNCING:**

```python
staging_state = {
    "sync_id": None,             # identificador de la transacción activa
    "profile_id": None,          # profileId recibido en sync.begin
    "profile_revision": None,    # profileRevision recibido en sync.begin
    "expected_count": 0,         # gestureCount recibido en sync.begin
    "received_count": 0,         # también representa nextIndex
    "received_ids": set(),       # IDs de gesto ya recibidos
    "received_tracks": set(),    # audioTrack ya recibidos
    "staging_path": "gestures.staging"
}
```
`nextIndex` se deriva directamente de `received_count`; no necesita mantenerse como una variable independiente.

**`sync.begin`:**
1. Validar que no hay staging previo (`gestures.staging` no existe o se limpia).
2. Abrir `gestures.staging` en modo `"w"`.
3. Escribir cabecera: `json.dumps({"version":1, "profileId":..., "profileRevision":..., "expectedGestureCount": N}) + "\n"`.
4. Inicializar `staging_state` con `syncId`, `profileId`, `profileRevision`, `expectedGestureCount`, `received_count = 0` y los conjuntos de IDs y pistas vacíos.

**`sync.gesture` (por cada gesto):**

1. Verificar que existe una transacción activa.
2. Verificar que `syncId` coincide con la transacción activa.
3. Verificar que `index == received_count` (`nextIndex` esperado).
4. Verificar que `received_count < expected_count`. Una vez recibidos `expected_count` gestos, no se aceptan más elementos en la transacción.
5. Validar el gesto completo (esquema, rangos y `data` válido).
6. Verificar que `id` no esté en `received_ids`.
7. Verificar que `audioTrack` esté en el rango `1..50` y no esté en `received_tracks`.
8. `json.dumps(gesture)` + `"\n"` → append a `gestures.staging`.
9. `received_count += 1`.
10. Agregar `id` a `received_ids`.
11. Agregar `audioTrack` a `received_tracks`.
12. Responder `sync.gesture` con `receivedCount` y `nextIndex`.

Para una request cuyo `syncId` coincide con la transacción activa, cualquiera de estos errores invalida la sincronización completa:

- gesto inválido;
- índice fuera de secuencia;
- `id` duplicado;
- `audioTrack` duplicado;
- fallo al escribir en staging.

En esos casos el firmware descarta `gestures.staging`, resetea `staging_state`, conserva intacto el perfil activo anterior y vuelve a `IDLE`, salvo que exista un fallo crítico que requiera `ERROR`.

Un `SYNC_ID_MISMATCH` no modifica ni descarta la transacción activa.

**Ventajas:**
- **RAM mínima**: solo se mantienen en memoria los metadatos de la transacción, contadores y conjuntos de IDs y `audioTrack` recibidos (máximo 50 elementos por conjunto).
- **Resistente a fallos**: Si falla a medio camino, `gestures.staging` queda incompleto y se descarta en boot/abort.
- **Streaming**: No requiere cargar 50 gestos en RAM simultáneamente.

---

## 5. Commit atómico (`sync.commit`)

### 5.1 Validaciones previas

Antes de escribir nada, el firmware DEBE verificar:

1. Existe una transacción de sincronización activa.
2. `syncId` coincide con la transacción activa.
3. `received_count == expected_count`.
4. Los índices recibidos formaron la secuencia completa `0..expected_count-1`, garantizado porque cada `sync.gesture` aceptado exigió `index == nextIndex`.
5. Todos los `gesture.id` son únicos.
6. Todos los `audioTrack` son únicos dentro del perfil y pertenecen al rango `1..50`.
7. Cada línea de gesto de `gestures.staging` puede parsearse correctamente.
8. Cada gesto sigue siendo válido según su esquema y `docs/gesture-format.md`.
9. El número real de gestos leído desde staging coincide con `expected_count`.

### 5.2 Generación de `gestures.json.tmp`

1. Leer `gestures.staging` línea a línea.
2. Primera línea → cabecera (extraer `profileId`, `profileRevision`, `expectedGestureCount`).
3. Líneas restantes → parsear cada gesto, validar `data`, construir array `gestures[]`.
4. Verificar que la cantidad realmente leída coincide con la declarada:

   ```python
   if len(gestures) != cabecera["expectedGestureCount"]:
       raise SyncIncompleteError()
   ```

5. Construir objeto final:

   ```python
   profile = {
       "version": 1,
       "profileId": cabecera["profileId"],
       "profileRevision": cabecera["profileRevision"],
       "gestureCount": len(gestures),
       "gestures": gestures
   }
   ```

6. Escribir `gestures.json.tmp` con `json.dumps(profile)` (compacto, sin indentación).
7. **Validar** `gestures.json.tmp` re-leyendo y comprobando estructura completa.

### 5.3 Promoción segura (LittleFS)

La activación final debe reemplazar lógicamente el perfil anterior por `gestures.json.tmp` sin exponer un perfil parcial como válido.

La implementación concreta de esta promoción debe verificarse sobre la versión de MicroPython y LittleFS utilizada por MITTEN.

Conceptualmente:

```python
promote_profile("gestures.json.tmp", "gestures.json")
```

`promote_profile()` DEBE garantizar que:

- `gestures.json.tmp` fue cerrado y validado completamente antes de comenzar la promoción;
- nunca se considera activo un archivo parcial;
- si la promoción falla antes de completarse, debe seguir existiendo un perfil recuperable válido;
- después de una promoción exitosa, `gestures.json` representa exactamente el nuevo perfil;
- el comportamiento cuando `gestures.json` ya existe debe estar cubierto por pruebas sobre el firmware real.

No debe asumirse que eliminar primero `gestures.json` y luego renombrar el `.tmp` es equivalente a un reemplazo atómico, porque un corte entre ambas operaciones dejaría temporalmente al dispositivo sin el perfil anterior.

Tras una promoción exitosa:

1. borrar `gestures.staging`;
2. cargar el nuevo `gestures.json` en RAM;
3. actualizar el perfil activo utilizado por reconocimiento.

La estrategia concreta deberá probarse con LittleFS en el ESP32, incluyendo cortes simulados antes, durante y después de la promoción.

La implementación conserva el perfil anterior como `gestures.json.bak` mientras promueve
y valida el nuevo archivo. Si la promoción falla, restaura el backup; si también falla
esa restauración, conserva el backup recuperable. En boot, un principal válido tiene
prioridad; sin principal válido se recupera primero el backup y después el `.tmp`.
El backup sólo se elimina cuando existe un principal válido. Las pruebas con fallos
inyectados en CPython no sustituyen la validación de durabilidad en MicroPython/LittleFS.

### 5.4 Respuesta y evento

- Responder `sync.commit` con `ok: true`, `committed: true`, `activeProfile` actualizado.
- Emitir evento `device.state` → `IDLE`.

---

## 6. Abort y limpieza (`sync.abort`, timeout, error)

Cuando una transacción debe descartarse por `sync.abort`, timeout o error fatal de esa sincronización:

1. Cerrar cualquier handle abierto asociado al staging.
2. Borrar `gestures.staging` si existe.
3. Borrar `gestures.json.tmp` si fue generado por la transacción fallida y todavía no fue promovido.
4. **No tocar** el `gestures.json` válido anterior.
5. Resetear `staging_state` en RAM.
6. Volver a `IDLE`, salvo que exista un fallo crítico que requiera `ERROR`.

Un `sync.abort` válido responde con `aborted: true`.

Los errores originados en `sync.gesture`, `sync.commit` o timeout utilizan las responses de error definidas en `docs/protocol.md`.

Un `SYNC_ID_MISMATCH` no debe descartar una transacción activa válida perteneciente a otro `syncId`.

> **Garantía**: una sincronización que no completa correctamente `sync.commit` nunca reemplaza el perfil activo.
---

## 7. Recuperación en boot

Al iniciar el firmware (estado `INITIALIZING`), antes de ofrecer el perfil activo:

```python
def load_active_profile():
    # 1. Una sincronización incompleta nunca se recupera.
    if exists("gestures.staging"):
        safe_remove("gestures.staging")
        log("INFO", "Removed orphaned staging file")

    # 2. El perfil principal válido tiene prioridad.
    if validate_file("gestures.json"):
        if exists("gestures.json.tmp"):
            safe_remove("gestures.json.tmp")
            log("INFO", "Removed stale temporary profile")

        log("INFO", "Profile loaded from gestures.json")
        return load_json("gestures.json")

    # 3. Si el principal no es válido, intentar recuperar un .tmp válido.
    if exists("gestures.json.tmp") and validate_file("gestures.json.tmp"):
        os.rename("gestures.json.tmp", "gestures.json")
        log("WARN", "Recovered profile from .tmp after interrupted commit")
        return load_json("gestures.json")

    # 4. No existe ningún perfil persistente válido.
    if exists("gestures.json.tmp"):
        safe_remove("gestures.json.tmp")

    log("WARN", "No valid active profile found")
    return None
```

**Función `validate_file(path)`:**
- Existe y es legible.
- JSON parseable.
- Estructura: `version==1`, `profileId` string, `profileRevision` string, `gestureCount` int ≥0, `gestures` array de longitud `gestureCount`.
- Cada gesto tiene un `id` válido y único dentro del perfil.
- Cada gesto tiene un `audioTrack` entero dentro del rango `1..50`.
- Cada `audioTrack` es único dentro del perfil activo.
- `gesture.id` y `audioTrack` son identidades independientes y no deben asumirse iguales.
- `data` es válido según `docs/gesture-format.md`.
- `min ≤ mean ≤ max` en `data.summary`.

**Reglas de recuperación:**

- `gestures.json` válido siempre tiene prioridad como perfil activo.
- `gestures.staging` NUNCA se promueve. Una transacción que no alcanzó un commit válido se considera incompleta.
- `gestures.json.tmp` solo puede promoverse cuando `gestures.json` no es válido y el `.tmp` supera la validación completa.
- Si `gestures.json` es válido y existe un `.tmp`, el `.tmp` se considera residual y puede eliminarse.
- Un `.tmp` inválido nunca se promueve.
- Si no existe ningún perfil válido, `activeProfile` será `null`.
- Un perfil válido con `gestureCount: 0` sigue siendo un perfil activo real.
---

## 8. Códigos de error relacionados

| Código | Cuándo se emite |
|--------|-----------------|
| `STORAGE_ERROR` | Fallo del sistema de archivos al leer, escribir, validar, eliminar o promover archivos necesarios para la sincronización. |
| `SYNC_INCOMPLETE` | `sync.commit` recibido pero `received_count != expected_count`. |
| `SYNC_FAILED` | Fallo genérico de sincronización no cubierto por un código más específico. |
| `SYNC_SEQUENCE_INVALID` | `sync.gesture.index` no coincide con el `nextIndex` esperado. |
| `SYNC_ID_MISMATCH` | El `syncId` recibido no coincide con la transacción activa. No destruye la transacción correcta. |
| `SYNC_NOT_ACTIVE` | Se recibe una operación que requiere sincronización cuando no existe ninguna transacción activa. |
| `PROFILE_TOO_LARGE` | `sync.begin` declara `gestureCount > capabilities.maxGestures`. |
| `GESTURE_INVALID` | `sync.gesture` contiene un gesto inválido o metadatos fuera de rango. |
| `DUPLICATE_GESTURE_ID` | `sync.gesture` contiene un `id` ya recibido durante la transacción activa. |

La semántica externa exacta de estos errores y sus responses pertenece a `docs/protocol.md`. Este documento únicamente describe cómo afectan a la persistencia y al estado interno de la sincronización.
---

## 9. Consideraciones de implementación (MicroPython)

- **FS**: Usar **LittleFS** (no FAT) en la flash del ESP32 para garantizar atomicidad de `rename` y resistencia a corrupción por power-loss.
- **RAM**: El staging incremental evita mantener simultáneamente toda la biblioteca en memoria. Durante `SYNCING` solo se conservan metadatos de la transacción, contadores, conjuntos de IDs y `audioTrack` recibidos y el buffer necesario para procesar una línea.
- **Validación**: Reutilizar validadores de `data` equivalentes a `packages/contracts` (implementación nativa MicroPython).
- **Logging**: Usar evento `diagnostic.log` (opcional) para tracing de recovery, staging, commit.
- **Tests**: verificar con fixtures:
  - `gestures.json` válido → carga correcta.
  - ausencia de `gestures.json` → `activeProfile: null`.
  - perfil válido con cero gestos → perfil activo con `gestureCount: 0`.
  - `.staging` huérfano → eliminado sin promover.
  - `gestures.json` válido + `.tmp` válido → el principal conserva prioridad.
  - `gestures.json` corrupto + `.tmp` válido → recovery del `.tmp`.
  - `gestures.json` y `.tmp` inválidos → ningún perfil activo.
  - índice fuera de secuencia → sincronización descartada.
  - `gesture.id` duplicado → sincronización descartada.
  - `audioTrack` duplicado → sincronización descartada.
  - `SYNC_ID_MISMATCH` → transacción activa correcta permanece intacta.
  - commit incompleto → perfil anterior intacto.
  - fallo durante escritura o validación de `.tmp` → perfil anterior intacto.
  - commit de perfil con cero gestos → perfil vacío válido.
  - simulación de power-loss alrededor de la promoción del archivo.

---

## 10. Referencias cruzadas

| Documento | Sección | Qué define |
|-----------|---------|------------|
| `docs/protocol.md` | §12 | Protocolo de sincronización (wire format, transacciones, códigos de error). |
| `docs/gesture-format.md` | §3, §7.4 | Esquema `data`, formato `gestures.json`, referencia a este doc. |
| `docs/requirements.md` | §14, §24 | REQ-PER-001/004/005, decisión cerrada de persistencia. |
| `docs/architecture.md` | §11, §38 | Convención DFPlayer, `synchronization.md` como documento existente. |

---

## 11. Historial de cambios

| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 1.0 | 2026-10-05 | — | Versión inicial: decisiones cerradas de persistencia y audioTrack. |
