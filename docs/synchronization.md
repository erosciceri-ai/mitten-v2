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

**Regla de oro**: En cualquier momento, `gestures.json` es el único perfil válido. `gestures.staging` y `gestures.json.tmp` son transitorios y **nunca** se exponen como perfil activo.

---

## 3. Formato del perfil activo (`gestures.json`)

```json
{
  "version": 1,
  "profileId": "profile-42",
  "profileRevision": "rev-7",
  "gestureCount": 3,
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
{"version":1,"profileId":"profile-42","profileRevision":"rev-7","expectedGestureCount":3}
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
    "expected_count": 0,      # de sync.begin
    "received_count": 0,      # incrementado por cada sync.gesture válido
    "received_ids": set(),    # para detectar duplicados en O(1)
    "staging_path": "gestures.staging"
}
```

**`sync.begin`:**
1. Validar que no hay staging previo (`gestures.staging` no existe o se limpia).
2. Abrir `gestures.staging` en modo `"w"`.
3. Escribir cabecera: `json.dumps({"version":1, "profileId":..., "profileRevision":..., "expectedGestureCount": N}) + "\n"`.
4. Inicializar `staging_state` en RAM.

**`sync.gesture` (por cada gesto):**
1. Validar gesto completo (esquema, rangos, `data` válido).
2. Verificar `id` no esté en `received_ids`.
3. `json.dumps(gesture)` + `"\n"` → append a `gestures.staging` (modo `"a"`).
4. `received_count += 1`, `received_ids.add(id)`.
5. Responder `sync.gesture` con `receivedCount` y `nextIndex`.

**Ventajas:**
- **RAM mínima**: Solo cabecera + contadores + set de IDs (≤50 enteros) en memoria.
- **Resistente a fallos**: Si falla a medio camino, `gestures.staging` queda incompleto y se descarta en boot/abort.
- **Streaming**: No requiere cargar 50 gestos en RAM simultáneamente.

---

## 5. Commit atómico (`sync.commit`)

### 5.1 Validaciones previas

Antes de escribir nada, el firmware DEBE verificar:

1. `syncId` coincide con la transacción activa.
2. `received_count == expected_count`.
3. Índices recibidos forman la secuencia completa `0..expected_count-1` (implícito por conteo y orden de llegada).
4. `received_ids` no tiene duplicados (ya verificado en cada `sync.gesture`).
5. Cada gesto en staging tiene `data` válido (re-leer y validar desde archivo).

### 5.2 Generación de `gestures.json.tmp`

1. Leer `gestures.staging` línea a línea.
2. Primera línea → cabecera (extraer `profileId`, `profileRevision`, `expectedGestureCount`).
3. Líneas restantes → parsear cada gesto, validar `data`, construir array `gestures[]`.
4. Construir objeto final:
   ```python
   profile = {
       "version": 1,
       "profileId": cabecera["profileId"],
       "profileRevision": cabecera["profileRevision"],
       "gestureCount": len(gestures),
       "gestures": gestures
   }
   ```
5. Escribir `gestures.json.tmp` con `json.dumps(profile)` (compacto, sin indentación).
6. **Validar** `gestures.json.tmp` re-leyendo y comprobando estructura completa.

### 5.3 Promoción atómica (LittleFS)

```python
os.rename("gestures.json.tmp", "gestures.json")
```

- En LittleFS (recomendado para ESP32), `rename` es **atómico y resistente a power-loss**: o bien el archivo antiguo persiste, o bien el nuevo queda completo. No hay estado intermedio corrupto.
- Tras rename exitoso: borrar `gestures.staging` (`os.remove`).
- Cargar nuevo perfil en RAM para reconocimiento inmediato.

### 5.4 Respuesta y evento

- Responder `sync.commit` con `ok: true`, `committed: true`, `activeProfile` actualizado.
- Emitir evento `device.state` → `IDLE`.

---

## 6. Abort y limpieza (`sync.abort`, timeout, error)

En cualquiera de estos casos:

1. Cerrar/borrar `gestures.staging` si existe (`os.remove`, ignorar error si no existe).
2. **No tocar** `gestures.json` (perfil anterior intacto).
3. Resetear `staging_state` en RAM.
4. Emitir evento `device.state` → `IDLE` (o `ERROR` si fallo crítico de almacenamiento).
5. Responder `sync.abort` con `aborted: true` o error correspondiente (`SYNC_INCOMPLETE`, `STORAGE_ERROR`, `SYNC_TIMEOUT`, etc.).

> **Garantía**: Una sincronización que no alcanza `sync.commit` **nunca** modifica el perfil activo.

---

## 7. Recuperación en boot

Al iniciar el firmware (estado `INITIALIZING`), antes de ofrecer el perfil activo:

```python
def load_active_profile():
    # 1. Perfil principal válido
    if validate_file("gestures.json"):
        log("INFO", "Profile loaded from gestures.json")
        return load_json("gestures.json")

    # 2. Commit interrumpido: .tmp válido
    if exists("gestures.json.tmp") and validate_file("gestures.json.tmp"):
        os.rename("gestures.json.tmp", "gestures.json")
        log("WARN", "Recovered profile from .tmp after interrupted commit")
        return load_json("gestures.json")

    # 3. Ningún perfil válido
    log("ERROR", "No valid profile found; starting with empty profile")
    # Opcional: persistir flag para diagnostic.log
    return empty_profile()

    # 4. Staging huérfano (sync incompleta previa)
    if exists("gestures.staging"):
        os.remove("gestures.staging")
        log("INFO", "Removed orphaned staging file")
```

**Función `validate_file(path)`:**
- Existe y es legible.
- JSON parseable.
- Estructura: `version==1`, `profileId` string, `profileRevision` string, `gestureCount` int ≥0, `gestures` array de longitud `gestureCount`.
- Cada gesto: `id` único, `audioTrack` 1–50, `data` válido según `docs/gesture-format.md`.
- `min ≤ mean ≤ max` en `data.summary`.

**Reglas de recuperación:**
- **`.tmp` solo se promueve si es 100% válido**. Si falla validación → se ignora y se trata como caso 3.
- **`.staging` NUNCA se promueve**. Una transacción sin `sync.commit` es incompleta por definición y se descarta silenciosamente (con log).
- **Perfil vacío** es un estado válido y seguro (`gestureCount: 0`, `gestures: []`). El dispositivo entra en `IDLE` y puede recibir nueva sincronización.

---

## 8. Códigos de error relacionados

| Código | Cuándo se emite |
|--------|-----------------|
| `STORAGE_ERROR` | Fallo de FS al leer/escribir/renombrar (ej. tarjeta llena, error HW). |
| `SYNC_INCOMPLETE` | `sync.commit` recibido pero `received_count < expected_count`. |
| `SYNC_FAILED` | Fallo genérico de sincronización no cubierto por código más específico. |
| `PROFILE_TOO_LARGE` | `sync.begin` declara `gestureCount > capabilities.maxGestures`. |
| `GESTURE_INVALID` | `sync.gesture` con `data` inválido o metadatos fuera de rango. |
| `DUPLICATE_GESTURE_ID` | `sync.gesture` con `id` ya recibido en esta transacción. |

---

## 9. Consideraciones de implementación (MicroPython)

- **FS**: Usar **LittleFS** (no FAT) en la flash del ESP32 para garantizar atomicidad de `rename` y resistencia a corrupción por power-loss.
- **RAM**: Staging incremental evita picos de heap. Máximo en RAM: cabecera + set de IDs (≈ 50 × 28 bytes ≈ 1.4 KB) + buffer de línea.
- **Validación**: Reutilizar validadores de `data` equivalentes a `packages/contracts` (implementación nativa MicroPython).
- **Logging**: Usar evento `diagnostic.log` (opcional) para tracing de recovery, staging, commit.
- **Tests**: Verificar con fixtures:
  - `gestures.json` válido → carga ok.
  - `gestures.json` corrupto + `.tmp` válido → recovery ok.
  - Ambos corruptos → perfil vacío + error log.
  - `.staging` huérfano → eliminado sin promover.
  - Commit atómico bajo simulación de power-loss (corte entre write y rename).

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