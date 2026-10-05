# MITTEN V2 — Protocolo serie Web Serial

## 1. Propósito

Este documento define la especificación técnica oficial de la comunicación entre:

```text
apps/web ↔ firmware/esp32
```

mediante USB Serial y Web Serial API.

La especificación debe permitir implementar de forma independiente y compatible:

- el cliente Web Serial de `apps/web`;
- el protocolo del firmware MicroPython en `firmware/esp32`;
- los contratos correspondientes en `packages/contracts`;
- el simulador ubicado en `tools/esp32-simulator`.

Este documento define el protocolo observable en el puerto serie. No define:

- la API HTTP;
- la estructura matemática definitiva de un gesto;
- el algoritmo de reconocimiento;
- el método físico de preparación de la microSD;
- el mecanismo interno exacto de persistencia atómica en el ESP32;
- la interfaz visual de la aplicación.

`docs/protocol.md` es el nombre canónico de esta especificación. Las referencias históricas a `docs/serial-protocol.md` corresponden a un nombre anterior del documento.

---

## 2. Convenciones normativas

Las palabras **DEBE**, **NO DEBE**, **DEBERÍA**, **NO DEBERÍA** y **PUEDE** se utilizan con sentido normativo:

- **DEBE / NO DEBE:** requisito obligatorio para cumplir el protocolo.
- **DEBERÍA / NO DEBERÍA:** recomendación que sólo puede omitirse por una razón técnica documentada.
- **PUEDE:** comportamiento opcional permitido.

En este documento:

- **frontend** significa la capa centralizada de Web Serial de `apps/web`;
- **dispositivo** significa el ESP32 real o el simulador compatible;
- **sesión serie** significa el intervalo entre abrir y cerrar un puerto;
- **frame** significa un mensaje JSON completo delimitado por salto de línea;
- **perfil activo** significa la única biblioteca actualmente habilitada para reconocimiento local;
- **staging** significa la copia temporal de una sincronización aún no confirmada;
- **bootstrap** significa el intercambio mínimo necesario para identificar el dispositivo y conocer su versión de protocolo.

---

## 3. Versión del protocolo

La versión definida por este documento es:

```text
Protocol Version: 2
```

Todos los mensajes normales de esta versión incluyen:

```json
{"v":2}
```

La versión del firmware y la versión del protocolo son conceptos diferentes:

- `firmwareVersion` identifica una compilación o publicación del firmware;
- `protocolVersion` identifica el contrato de comunicación;
- la compatibilidad se decide por `protocolVersion`, no por `firmwareVersion`.

Un cambio incompatible en comandos, campos obligatorios, semántica o framing requiere una nueva versión del protocolo. Agregar campos opcionales que los receptores puedan ignorar no obliga por sí solo a incrementar la versión.

### 3.1. Contrato de bootstrap estable

La forma mínima de `device.handshake` definida en la sección 8 es un **bootstrap contract normativo**.

Las versiones futuras de MITTEN:

- DEBEN seguir reconociendo la solicitud mínima de handshake de Protocol Version 2;
- DEBEN preservar los campos mínimos de la respuesta de handshake;
- PUEDEN agregar campos nuevos;
- NO DEBEN renombrar ni eliminar los campos mínimos del bootstrap.

Esto permite que un frontend V2 identifique un MITTEN futuro y comunique que su protocolo es incompatible, aunque no pueda ejecutar ninguna otra operación.

Durante el bootstrap, el frontend valida únicamente el envelope mínimo y los campos mínimos del handshake. La validación estricta de versión comienza después de conocer `protocolVersion`.

---

## 4. Transporte

### 4.1. Configuración del puerto

La configuración inicial obligatoria es:

| Parámetro | Valor |
|---|---:|
| Transporte | USB Serial mediante Web Serial API |
| Baud rate | `115200` |
| Data bits | `8` |
| Stop bits | `1` |
| Parity | `none` |
| Flow control | `none` |

Web Serial es el único propietario del puerto. Ningún componente de UI, proceso auxiliar, bridge local o `monitor.py` puede abrir el mismo puerto en paralelo.

### 4.2. Codificación

Todos los frames utilizan:

```text
UTF-8 sin BOM
```

Reglas:

- cada frame contiene exactamente un objeto JSON;
- el emisor DEBE serializar JSON válido;
- el emisor DEBERÍA usar JSON compacto, sin indentación;
- el orden de las propiedades JSON no tiene significado;
- no se permiten `NaN`, `Infinity` ni otros valores ajenos a JSON;
- un salto de línea dentro de un string JSON DEBE estar escapado como `\n`;
- los números declarados como enteros no pueden incluir parte decimal.

### 4.3. Delimitación NDJSON

Cada frame termina con un byte `LF`:

```text
0x0A
```

El emisor DEBE enviar `LF`. El receptor DEBE aceptar tanto:

```text
LF
CRLF
```

Si una línea termina en `CRLF`, el receptor elimina el `CR` final antes de interpretar JSON.

Una línea vacía o compuesta únicamente por espacios puede ignorarse. Ningún emisor conforme debería generar líneas vacías.

Ejemplo sobre el cable:

```text
{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n
```

### 4.4. Reconstrucción de mensajes fragmentados

Los límites de lectura de Web Serial o UART no coinciden necesariamente con los límites de un frame. Un mensaje puede llegar:

- dividido entre varias lecturas;
- junto con varios mensajes en una sola lectura;
- dividido dentro de un carácter UTF-8 multibyte.

El receptor DEBE aplicar este algoritmo conceptual:

1. Acumular bytes en un buffer de recepción.
2. Buscar el siguiente byte `LF`.
3. Si no existe, conservar el fragmento para la lectura siguiente.
4. Si existe, extraer todos los bytes anteriores como una línea.
5. Eliminar un `CR` final si existe.
6. Validar el límite de bytes.
7. Decodificar la línea completa como UTF-8 estricto.
8. Parsear JSON.
9. Validar el envelope antes de procesar el contenido.
10. Continuar con cualquier byte restante en el buffer.

El receptor NO DEBE asumir que una llamada a `read()` devuelve un mensaje completo.

### 4.5. Tamaño máximo

Protocol Version 2 fija:

`maxMessageBytes = 8192`

`maxMessageBytes` es el máximo número de bytes UTF-8 permitido en una línea, sin contar `LF`.

El límite aplica tanto durante bootstrap como después del handshake.

Protocol Version 2 no implementa fragmentación lógica de mensajes: cada objeto NDJSON completo debe caber dentro de un único frame de hasta 8192 bytes.

Si un frame supera el límite:

1. El receptor entra en modo de descarte.
2. Descarta bytes hasta el siguiente `LF`.
3. Restablece el framing en la línea siguiente.
4. Después del handshake informa `MESSAGE_TOO_LARGE`.
5. Durante bootstrap, el frontend rechaza el dispositivo y cierra la conexión.

Importante: esto no contradice la sección 4.4. “fragmentados” ahí significa que un mismo frame puede llegar repartido entre varias lecturas UART/Web Serial. Eso sigue siendo correcto. Lo que no existe es fragmentación del protocolo en varios mensajes.

### 4.6. Mensajes incompletos

El receptor DEBE utilizar un timeout de inactividad finito para un fragmento que aún no contiene `LF`.

Cuando vence:

- se descarta el fragmento completo;
- se restablece el parser para la siguiente línea;
- después del handshake se informa `INCOMPLETE_MESSAGE`;
- durante bootstrap el frontend cierra la conexión;
- al cerrarse o perderse el puerto, cualquier fragmento pendiente se descarta sin procesarlo.

El timeout de inactividad de un frame incompleto en Protocol Version 2 es de `5000 ms`.
Si durante `5000 ms` no se recibe el `LF` que completa el frame, el receptor aplica el comportamiento de descarte definido anteriormente.

### 4.7. Logs y salida de depuración

El canal USB Serial del protocolo NO DEBE contener texto libre.

En particular, el firmware NO DEBE mezclar con el protocolo:

- mensajes de `print()` sin envelope;
- banners de arranque;
- trazas de excepciones;
- prompts del REPL;
- estados históricos como `STATUS:LISTO`;
- líneas prefijadas con `ERROR:` o `JSON:`.

El firmware debe capturar las excepciones relevantes y convertirlas en errores estructurados. El REPL y los logs crudos deben deshabilitarse en ese canal o dirigirse a otro medio.

Un build de diagnóstico PUEDE emitir:

```json
{"v":2,"type":"event","event":"diagnostic.log","data":{"level":"INFO","message":"Sensor initialized"}}
```

`diagnostic.log` es opcional, no puede ser necesario para el funcionamiento y puede ser ignorado por el frontend.

---

## 5. Modelo de comunicación

La comunicación usa tres clases de mensaje:

1. `request`: solicitud del frontend al dispositivo.
2. `response`: respuesta del dispositivo a una solicitud.
3. `event`: notificación espontánea del dispositivo.

Direcciones permitidas:

| Tipo | Emisor | Receptor |
|---|---|---|
| `request` | Frontend | Dispositivo |
| `response` | Dispositivo | Frontend |
| `event` | Dispositivo | Frontend |

El frontend no envía `response` ni `event`. El dispositivo no inicia `request`.

Esta asimetría evita ciclos de mensajes y simplifica la implementación en MicroPython.

### 5.1. Reglas de entrega

- Cada request válida produce exactamente una response.
- Una response repite exactamente el `id` de la request.
- Una operación asíncrona aceptada produce primero su response y después sus eventos.
- Una request no puede producir dos responses.
- Los eventos no reciben ACK.
- El receptor procesa los frames en el orden en que aparecen en el stream.
- La correlación se basa en IDs; el frontend no debe depender únicamente del orden de respuestas.

---

## 6. Envelopes generales

### 6.1. Request

```json
{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}
```

Campos:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `v` | integer | Sí | Versión del protocolo usada por el emisor. |
| `type` | string | Sí | Siempre `request`. |
| `id` | string | Sí | Identificador de la request. |
| `command` | string | Sí | Comando solicitado. |
| `payload` | object | Sí | Datos del comando; usa `{}` si está vacío. |

### 6.2. Response exitosa

```json
{"v":2,"type":"response","id":"req-1","ok":true,"result":{}}
```

Campos:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `v` | integer | Sí | Versión del protocolo. |
| `type` | string | Sí | Siempre `response`. |
| `id` | string | Sí | ID de la request original. |
| `ok` | boolean | Sí | Siempre `true`. |
| `result` | object | Sí | Resultado del comando. |

Una response exitosa NO DEBE incluir `error`.

### 6.3. Response con error

```json
{"v":2,"type":"response","id":"req-1","ok":false,"error":{"code":"INVALID_STATE","message":"Command is not allowed in the current state"}}
```

Campos:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `v` | integer | Sí | Versión del protocolo. |
| `type` | string | Sí | Siempre `response`. |
| `id` | string | Sí | ID de la request original. |
| `ok` | boolean | Sí | Siempre `false`. |
| `error` | object | Sí | Error estructurado. |

Una response con error NO DEBE incluir `result`.

### 6.4. Event

```json
{"v":2,"type":"event","event":"device.state","data":{"state":"IDLE"}}
```

Campos:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `v` | integer | Sí | Versión del protocolo. |
| `type` | string | Sí | Siempre `event`. |
| `event` | string | Sí | Nombre estable del evento. |
| `data` | object | Sí | Datos del evento; usa `{}` si está vacío. |

### 6.5. Objeto de error

Forma general:

```json
{"code":"GESTURE_INVALID","message":"Gesture data is invalid","details":{"index":1,"field":"data"}}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `code` | string | Sí | Código estable para decisiones programáticas. |
| `message` | string | Sí | Texto de diagnóstico, no contrato de UI. |
| `details` | object | No | Contexto estructurado no sensible. |

La aplicación DEBE decidir su comportamiento mediante `code`. No debe comparar `message`, traducirlo directamente como única explicación ni asumir que permanecerá idéntico entre versiones de firmware.

`details` no puede contener credenciales, tokens, trazas internas completas ni datos sensibles.

### 6.6. Identificadores de request

`id`:

- identifica exactamente una request;
- es generado por el frontend;
- debe tener entre 1 y 64 caracteres ASCII;
- sólo puede usar `A-Z`, `a-z`, `0-9`, `.`, `_`, `:` y `-`;
- debe ser único dentro de una sesión serie;
- no implica idempotencia ni identifica una sincronización completa.

Patrón normativo:

```text
^[A-Za-z0-9._:-]{1,64}$
```

El frontend NO DEBE reutilizar un ID. El dispositivo DEBE rechazar con `DUPLICATE_REQUEST_ID` un ID duplicado que todavía esté pendiente o asociado a una operación asíncrona activa.

Una retransmisión se considera una request nueva y utiliza un ID nuevo.

### 6.7. Campos desconocidos

Dentro de Protocol Version 2:

- los receptores DEBEN ignorar campos adicionales desconocidos en un objeto conocido;
- los receptores DEBEN rechazar campos obligatorios ausentes o con tipo incorrecto;
- el dispositivo DEBE responder `UNKNOWN_COMMAND` ante un comando desconocido;
- el frontend DEBE ignorar de forma segura un evento desconocido y registrarlo para diagnóstico;
- un `type` desconocido es `INVALID_MESSAGE`.

Esta regla permite extensiones aditivas sin volver ambiguos los campos existentes.

---

## 7. Ciclo de vida de una conexión

La secuencia obligatoria es:

```text
1. El usuario autoriza y selecciona un puerto mediante Web Serial.
2. El frontend abre el puerto con la configuración de la sección 4.1.
3. El frontend inicia su parser incremental.
4. El frontend envía device.handshake.
5. El dispositivo responde con el bootstrap mínimo.
6. El frontend valida identidad y compatibilidad.
7. Sólo entonces la aplicación considera conectado a MITTEN.
```

Abrir el puerto correctamente no significa que MITTEN esté conectado.

Antes de completar el handshake:

- sólo se permite `device.handshake`;
- cualquier otro comando parseable recibe `HANDSHAKE_REQUIRED`;
- una línea no vacía con framing, UTF-8 o JSON inválido hace que el frontend rechace el dispositivo y cierre el puerto;
- el frontend utiliza un timeout finito;
- un reintento de handshake utiliza un `id` nuevo.

Después de un handshake compatible:

- cada mensaje normal debe usar `v: 2`;
- un error recuperable de framing o de mensaje no cierra automáticamente el puerto;
- el parser intenta resincronizarse en el siguiente `LF`;
- los errores de transporte irrecuperables sí terminan la sesión.

Cerrar el puerto cancela todas las esperas locales del frontend y elimina su mapa de requests pendientes.

---

## 8. Handshake

### 8.1. Solicitud

Comando:

```text
device.handshake
```

Mensaje mínimo:

```json
{"v":2,"type":"request","id":"req-1","command":"device.handshake","payload":{"client":"MITTEN_WEB","supportedProtocolVersions":[2]}}
```

Payload:

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `client` | string | Sí | Para el frontend oficial V2 es `MITTEN_WEB`. |
| `supportedProtocolVersions` | array de integer | Sí | Lista no vacía, sin duplicados. |

El `v` superior representa la versión preferida usada para formular el bootstrap. En V2 es `2`.

### 8.2. Respuesta

```json
{"v":2,"type":"response","id":"req-1","ok":true,"result":{"device":"MITTEN","firmwareVersion":"2.0.0","protocolVersion":2,"state":"IDLE","capabilities":{"maxGestures":50,"maxMessageBytes":8192}}}
```

En Protocol Version 2, `capabilities.maxMessageBytes` DEBE anunciar `8192`.

La capability se conserva explícitamente en el handshake para que versiones futuras del protocolo puedan anunciar capacidades diferentes sin modificar la estructura básica del bootstrap.

Campos mínimos de `result`:

| Campo | Tipo | Regla |
|---|---|---|
| `device` | string | Debe ser exactamente `MITTEN`. |
| `firmwareVersion` | string | Versión no vacía para diagnóstico. Se recomienda SemVer. |
| `protocolVersion` | integer | Versión preferida implementada por el dispositivo. |
| `state` | string | Uno de los estados oficiales. |
| `capabilities.maxGestures` | integer | Capacidad máxima, mayor o igual que cero. |
| `capabilities.maxMessageBytes` | integer | Límite de bytes por frame anunciado por ese dispositivo. |

La implementación inicial de MITTEN V2 anuncia una capacidad de 50 gestos. El frontend aplica siempre el menor valor entre el límite de producto de 50 y `capabilities.maxGestures`. Mantener la capacidad en el handshake permite que una versión futura cambie el límite sin rediseñar el protocolo.

El dispositivo DEBE responder al handshake durante `INITIALIZING`, `CALIBRATING`, `IDLE`, `CAPTURING`, `SYNCING` o `ERROR` siempre que su capa de protocolo esté operativa.

Un resultado `ok: true` significa que el bootstrap fue entendido. No significa que frontend y firmware sean compatibles.

### 8.3. Validación de identidad

El frontend sólo identifica el puerto como MITTEN cuando:

```text
result.device === "MITTEN"
```

Si no recibe una response válida, el campo no existe o el valor es diferente:

1. no muestra el dispositivo como conectado;
2. produce el error local `DEVICE_NOT_MITTEN` o `INVALID_DEVICE_MESSAGE`, según corresponda;
3. cancela requests pendientes;
4. cierra el puerto.

### 8.4. Validación de compatibilidad

El frontend comprueba:

```text
result.protocolVersion ∈ payload.supportedProtocolVersions
```

Si no pertenece:

1. conserva la información de versión para diagnóstico;
2. produce `PROTOCOL_INCOMPATIBLE`;
3. no envía comandos funcionales;
4. informa que la aplicación o el firmware debe actualizarse;
5. cierra el puerto.

La versión del firmware no se utiliza como sustituto de esta comprobación.

### 8.5. Handshake con una versión futura

Un firmware futuro puede responder, por ejemplo:

```json
{"v":3,"type":"response","id":"req-1","ok":true,"result":{"device":"MITTEN","firmwareVersion":"3.0.0","protocolVersion":3,"state":"IDLE","capabilities":{"maxGestures":50,"maxMessageBytes":16384}}}
```

El parser de bootstrap V2 debe poder leer los campos mínimos aunque `v` sea desconocido. Después debe rechazar la compatibilidad porque `3` no aparece en `[2]`.

---

## 9. Estados del dispositivo

### 9.1. Estados oficiales

| Estado | Significado |
|---|---|
| `INITIALIZING` | El firmware está preparando servicios y almacenamiento. |
| `CALIBRATING` | El dispositivo calibra los sensores necesarios. |
| `IDLE` | No hay una operación exclusiva; puede aceptar captura o sincronización. |
| `CAPTURING` | Existe una captura de gesto en curso. |
| `SYNCING` | Existe una transacción de sincronización en staging. |
| `ERROR` | Un fallo impide operar con seguridad. En Protocol Version 2 la recuperación requiere reiniciar el ESP32. |

`DISCONNECTED` no es un estado del firmware. Es un estado local del frontend cuando no existe una sesión Web Serial válida.

### 9.2. Reconocimiento e `IDLE`

Protocol Version 2 no usa `RECOGNIZING` como estado persistente.

El reconocimiento normal ocurre localmente y puede ejecutarse de forma continua mientras el dispositivo está `IDLE`. Cambiar de estado por cada evaluación de sensores produciría ruido de protocolo y haría parecer ocupado al dispositivo.

Un reconocimiento exitoso se comunica, si existe una conexión compatible, mediante `recognition.detected`. Esto no modifica el estado principal.

### 9.3. Evento de cambio de estado

```json
{"v":2,"type":"event","event":"device.state","data":{"state":"CAPTURING"}}
```

El dispositivo DEBE emitir `device.state` cuando cambia su estado después del handshake. El frontend debe validar `data.state` antes de actualizar la UI.

Los textos visuales, traducciones, colores e iconos no forman parte del protocolo.

### 9.4. Estado `ERROR`

`ERROR` se reserva para un fallo que impide continuar de forma segura, por ejemplo:

- almacenamiento activo corrupto sin copia válida recuperable;
- inicialización crítica de sensores fallida;
- error interno que invalida la máquina de estados.

Un comando desconocido, payload inválido o gesto rechazado no cambia por sí solo el dispositivo a `ERROR`.

Cuando `state` es `ERROR`, `device.status` debe incluir un objeto `error`.

Mientras el dispositivo está en `ERROR`:

- `device.handshake` sigue permitido;
- `device.status` sigue permitido;
- los comandos funcionales se rechazan con `INVALID_STATE`;
- Protocol Version 2 no define un comando `device.reset`;
- la recuperación se realiza reiniciando el ESP32;
- después del reinicio, el dispositivo comienza nuevamente en `INITIALIZING`.

---

## 10. Consulta de estado

Comando:

```text
device.status
```

Puede utilizarse después de un handshake compatible en cualquier estado.

### 10.1. Solicitud

```json
{"v":2,"type":"request","id":"req-2","command":"device.status","payload":{}}
```

### 10.2. Respuesta

```json
{"v":2,"type":"response","id":"req-2","ok":true,"result":{"state":"IDLE","activeProfile":{"profileId":"profile-42","profileRevision":"rev-7","gestureCount":2},"activeSync":null,"error":null}}
```

Campos:

| Campo | Tipo | Descripción |
|---|---|---|
| `state` | string | Estado oficial actual. |
| `activeProfile` | object o null | Perfil persistente activo. |
| `activeSync` | object o null | Transacción temporal en curso. |
| `error` | object o null | Error que explica `ERROR`. |

`activeProfile`, cuando no es `null`, contiene:

| Campo | Tipo | Descripción |
|---|---|---|
| `profileId` | string | Identidad opaca del perfil. |
| `profileRevision` | string | Revisión exacta de la biblioteca activa. |
| `gestureCount` | integer | Cantidad de gestos activos. |

`activeSync`, cuando no es `null`, contiene:

| Campo | Tipo | Descripción |
|---|---|---|
| `syncId` | string | Transacción en staging. |
| `profileId` | string | Perfil que intenta sincronizarse. |
| `profileRevision` | string | Revisión que intenta sincronizarse. |
| `expectedGestureCount` | integer | Total declarado en `sync.begin`. |
| `receivedCount` | integer | Total validado hasta el momento. |
| `nextIndex` | integer | Próximo índice esperado. |

Si nunca se sincronizó un perfil válido, `activeProfile` es `null`.
Si `state === "SYNCING"`, `activeSync` DEBE ser distinto de `null`.

La siguiente combinación es inválida:

```json
{"state":"SYNCING","activeSync":null}
```

Si el frontend recibe esa combinación después de un handshake compatible, debe tratarla como `INVALID_DEVICE_MESSAGE`.

### 10.3. Comandos permitidos por estado

| Comando | Antes de handshake | `INITIALIZING` | `CALIBRATING` | `IDLE` | `CAPTURING` | `SYNCING` | `ERROR` |
|---|---:|---:|---:|---:|---:|---:|---:|
| `device.handshake` | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| `device.status` | No | Sí | Sí | Sí | Sí | Sí | Sí |
| `capture.start` | No | No | No | Sí | No | No | No |
| `sync.begin` | No | No | No | Sí | No | No | No |
| `sync.gesture` | No | No | No | No | No | Sí | No |
| `sync.commit` | No | No | No | No | No | Sí | No |
| `sync.abort` | No | No | No | No | No | Sí | No |

Una operación exclusiva solicitada durante `CAPTURING` o `SYNCING` recibe `DEVICE_BUSY`. Una operación no permitida durante `INITIALIZING`, `CALIBRATING` o `ERROR` recibe `INVALID_STATE`.

---

## 11. Captura de gestos

### 11.1. Principios

La captura obtiene datos físicos del dispositivo. El nombre o frase visible del gesto pertenece al frontend y al backend; no se envía en `capture.start`.

El firmware:

- captura sensores;
- procesa la captura;
- devuelve un objeto abstracto `data`;
- no persiste el gesto en la biblioteca activa como efecto de la captura;
- no genera ni transfiere el MP3.

La estructura y validación semántica de `data` están definidas en `docs/gesture-format.md`.

### 11.2. Inicio

Comando:

```text
capture.start
```

Solicitud:

```json
{"v":2,"type":"request","id":"req-3","command":"capture.start","payload":{}}
```

Sólo se acepta en `IDLE`.
Antes de emitir una response con `accepted: true`, el firmware DEBE reservar internamente la operación exclusiva de captura.

Desde ese momento, aunque todavía no se haya emitido el evento `device.state` con `CAPTURING`, una nueva operación exclusiva como `capture.start` o `sync.begin` debe rechazarse con `DEVICE_BUSY`.

Esto evita una ventana de carrera entre la aceptación de la request y la notificación del cambio de estado.

Respuesta de aceptación:

```json
{"v":2,"type":"response","id":"req-3","ok":true,"result":{"accepted":true,"operationTimeoutMs":15000}}
```

`operationTimeoutMs`:

- es un entero positivo;
- indica el plazo máximo anunciado por el firmware para emitir un evento terminal;
- en Protocol Version 2 su valor es `15000`;
- el frontend usa este valor más un margen local pequeño para transporte y scheduling.


### 11.3. Orden de eventos

Después de aceptar la request, el dispositivo emite en este orden:

```text
response ok
→ device.state CAPTURING
→ capture.progress PREPARING
→ capture.progress RECORDING
→ capture.progress PROCESSING
→ capture.completed o capture.failed
→ device.state IDLE o ERROR
```

Debe existir exactamente un evento terminal:

```text
capture.completed
```

o:

```text
capture.failed
```

### 11.4. Progreso

```json
{"v":2,"type":"event","event":"capture.progress","data":{"requestId":"req-3","phase":"RECORDING","progress":40}}
```

Fases estables y ordenadas:

1. `PREPARING`
2. `RECORDING`
3. `PROCESSING`

`progress` es opcional. Si existe:

- es un entero entre `0` y `100`;
- no disminuye dentro de una misma fase;
- puede volver a cero al comenzar una fase nueva;
- no debe utilizarse para inferir éxito.

`requestId` referencia la request `capture.start`; no crea un tipo adicional de ID.

### 11.5. Captura terminada

```json
{"v":2,"type":"event","event":"capture.completed","data":{"requestId":"req-3","data":{}}}
```

`data` debe ser un objeto JSON. El protocolo sólo define su posición y transporte. Su estructura, versión y validación semántica pertenecen a `docs/gesture-format.md`.

El frontend DEBE validar `data` contra los contratos del formato de gesto antes de enviarlo al backend. El backend volverá a validarlo antes de persistirlo.

### 11.6. Captura fallida

```json
{"v":2,"type":"event","event":"capture.failed","data":{"requestId":"req-3","error":{"code":"SENSOR_ERROR","message":"Unable to read flex sensors"}}}
```

Una captura fallida recuperable vuelve a `IDLE`. Un fallo que impide operar con seguridad cambia a `ERROR`.

El dispositivo NO DEBE emitir `capture.completed` después de `capture.failed` para el mismo `requestId`.

### 11.7. Desconexión y timeout

Si el puerto se pierde durante una captura:

- el frontend produce `SERIAL_DISCONNECTED`;
- cancela la espera asociada al `requestId`;
- no guarda datos parciales;
- no considera completada la captura;
- libera los recursos Web Serial que pueda liberar de forma segura.

El firmware debe finalizar o abortar internamente la captura dentro del límite anunciado. El resultado no entregado no se incorpora automáticamente al perfil activo.

---

## 12. Sincronización transaccional

### 12.1. Estrategia elegida

Protocol Version 2 utiliza:

```text
sync.begin
→ sync.gesture repetido
→ sync.commit
```

Con salida alternativa:

```text
sync.abort
```

No se envía toda la biblioteca en un único JSON.

La transferencia de un gesto por frame se elige porque:

- limita el pico de RAM en MicroPython;
- permite validar cada unidad antes de continuar;
- proporciona progreso mediante las respuestas;
- permite timeouts por paso;
- simplifica encontrar qué gesto falló;
- cumple el reemplazo completo sin convertirlo en sincronización incremental.

Aunque se transmitan gestos individualmente, el resultado lógico sigue siendo el reemplazo completo de la biblioteca.

El backend es la fuente de verdad de la biblioteca. Antes de iniciar esta secuencia, el frontend obtiene del backend el snapshot completo del usuario, lo valida y lo transforma al contrato serial. El ESP32 conserva únicamente el perfil confirmado más reciente.

La sincronización transporta metadatos, `id`, `name`, `audioTrack` y `data`. No transfiere archivos MP3 ni inspecciona la microSD del DFPlayer.

### 12.2. Identidades

Cada comando de la secuencia tiene su propio `id` de request.

La sincronización completa se identifica mediante:

```text
syncId
```

`syncId`:

- es generado por el frontend;
- debe ser único para una transacción;
- usa el mismo patrón y límite de longitud que `id`;
- aparece en `sync.begin`, `sync.gesture`, `sync.commit`, `sync.abort` y eventos de sincronización;
- no sustituye al `id` de cada request.

El perfil se identifica mediante dos strings opacos:

- `profileId`: identifica el perfil propietario sin incluir nombre, email, JWT ni otra credencial;
- `profileRevision`: identifica la versión exacta de la biblioteca que se está transfiriendo.

Reglas:

| Campo | Patrón | Longitud máxima |
|---|---|---:|
| `profileId` | `^[A-Za-z0-9._:-]+$` | 64 |
| `profileRevision` | `^[A-Za-z0-9._:-]+$` | 128 |

Ambos deben ser no vacíos. El protocolo los trata como valores opacos y no interpreta su estructura.

### 12.3. Propiedades transaccionales obligatorias

Durante toda la sincronización:

- el perfil activo anterior permanece disponible para reconocimiento;
- el staging no se utiliza para reconocimiento;
- ningún gesto nuevo se activa individualmente;
- eliminar un gesto del perfil nuevo provoca su ausencia después del commit;
- sólo `sync.commit` puede activar el staging;
- un abort o fallo nunca marca una biblioteca parcial como válida;
- el firmware mantiene como máximo una transacción de sincronización activa.

La implementación interna puede usar archivos temporales, doble buffer, rename o un puntero de versión. El mecanismo exacto queda abierto, pero debe cumplir la semántica anterior.

### 12.4. `sync.begin`

Solicitud:

```json
{"v":2,"type":"request","id":"req-10","command":"sync.begin","payload":{"syncId":"sync-a1","profileId":"profile-42","profileRevision":"rev-7","gestureCount":2}}
```

Payload:

| Campo | Tipo | Regla |
|---|---|---|
| `syncId` | string | ID válido y no asociado a otra transacción activa. |
| `profileId` | string | Identificador opaco válido. |
| `profileRevision` | string | Revisión opaca válida. |
| `gestureCount` | integer | Entre `0` y `min(50, capabilities.maxGestures)` en MITTEN V2. |

Antes de aceptar, el firmware valida:

- handshake compatible;
- estado `IDLE`;
- tipos y límites del payload;
- capacidad máxima;
- disponibilidad inicial de almacenamiento para staging.

Respuesta:

```json
{"v":2,"type":"response","id":"req-10","ok":true,"result":{"accepted":true,"syncId":"sync-a1","expectedGestureCount":2,"receivedCount":0,"nextIndex":0,"idleTimeoutMs":10000}}
```

`idleTimeoutMs` es el máximo de inactividad permitido entre mensajes válidos de esa transacción.

En Protocol Version 2 su valor es `10000 ms`.

Después de la response exitosa, el dispositivo emite:

```json
{"v":2,"type":"event","event":"device.state","data":{"state":"SYNCING"}}
```

El perfil activo no cambia.

### 12.5. `sync.gesture`

Solicitud:

```json
{"v":2,"type":"request","id":"req-11","command":"sync.gesture","payload":{"syncId":"sync-a1","index":0,"gesture":{"id":17,"name":"hola","audioTrack":1,"data":{}}}}
```

Payload:

| Campo | Tipo | Regla |
|---|---|---|
| `syncId` | string | Debe coincidir con la transacción activa. |
| `index` | integer | Debe ser exactamente `nextIndex`, comenzando en cero. |
| `gesture` | object | Gesto completo que debe caber en un frame. |

Campos mínimos de `gesture`:

| Campo | Tipo | Regla |
|---|---|---|
| `id` | integer | Entre `1` y `2147483647`; único dentro del perfil. |
| `name` | string | Entre 1 y 60 puntos de código Unicode; sin caracteres de control. |
| `audioTrack` | integer | Entre `1` y `50` en MITTEN V2. Asignado por el backend en creación (first-fit, inmutable). Convención DFPlayer: `/mp3/{audioTrack:04d}.mp3`, reproducción mediante `playMp3Folder(audioTrack)`. |
| `data` | object | Conforme a `docs/gesture-format.md`. |

El nombre no es la identidad técnica del gesto. Dos nombres iguales no sustituyen la validación de IDs.

Protocol Version 2 exige IDs de gesto únicos.

`gesture.id` es inmutable durante la vida del gesto.

`audioTrack` se asigna al crear el gesto mediante first-fit dentro del rango `1..50` y permanece inmutable mientras el gesto exista.

`gesture.id` y `audioTrack` son identidades independientes y NO DEBEN asumirse iguales.

`name` y `data` pueden modificarse sin cambiar `gesture.id` ni `audioTrack`.

El MP3 asociado puede regenerarse utilizando la misma pista.

Cuando un gesto es eliminado, su `audioTrack` queda libre y puede reutilizarse posteriormente mediante first-fit.

La relación entre un gesto existente y su `audioTrack` es 1:1.

El firmware valida el gesto completo antes de incorporarlo al staging.

Respuesta exitosa:

```json
{"v":2,"type":"response","id":"req-11","ok":true,"result":{"syncId":"sync-a1","receivedCount":1,"nextIndex":1}}
```

`receivedCount` es el progreso confirmado. El frontend no cuenta como enviado un gesto hasta recibir esta response.

Si un gesto de la transacción correcta es inválido, está fuera de secuencia o repite un ID:

1. la request recibe una response con error;
2. el firmware descarta todo el staging de esa transacción;
3. el perfil activo anterior permanece intacto;
4. el estado vuelve a `IDLE`;
5. la sincronización completa debe reiniciarse con un `syncId` nuevo.

Un `syncId` que no coincide produce `SYNC_ID_MISMATCH` y no modifica la transacción activa.

### 12.6. Recuperación ante una response perdida

Si vence el timeout de una request `sync.gesture`, el frontend NO DEBE reenviar a ciegas el mismo gesto.

Mientras el puerto siga operativo debe consultar `device.status`:

- si `activeSync.nextIndex` avanzó, el gesto fue aceptado y puede continuar;
- si `nextIndex` no avanzó, puede enviar nuevamente el gesto con un `id` de request nuevo;
- si `activeSync` es `null`, debe reiniciar la sincronización completa;
- si el puerto se perdió, aplica la recuperación de la sección 12.11.

### 12.7. `sync.commit`

Solicitud:

```json
{"v":2,"type":"request","id":"req-13","command":"sync.commit","payload":{"syncId":"sync-a1"}}
```

Antes de activar, el firmware DEBE:

1. verificar que `syncId` coincide;
2. verificar que recibió exactamente `gestureCount` gestos;
3. verificar que los índices forman la secuencia completa `0..gestureCount-1`;
4. verificar nuevamente IDs duplicados y estructura global;
5. verificar que todos los gestos pueden leerse desde staging;
6. persistir la nueva biblioteca de manera atómica y recuperable (ver `docs/synchronization.md`);
7. activar la nueva biblioteca como una sola operación lógica;
8. persistir `profileId`, `profileRevision` y `gestureCount`;
9. conservar siempre una biblioteca identificable como válida.

Respuesta exitosa:

```json
{"v":2,"type":"response","id":"req-13","ok":true,"result":{"committed":true,"syncId":"sync-a1","activeProfile":{"profileId":"profile-42","profileRevision":"rev-7","gestureCount":2}}}
```

El firmware sólo puede enviar `committed: true` después de completar la activación segura.

Después emite:

```json
{"v":2,"type":"event","event":"device.state","data":{"state":"IDLE"}}
```

Una response `ok: true` de `sync.commit` implica:

```text
biblioteca activa del ESP32 == snapshot profileRevision transferido
```

El commit confirma el estado **gesto sincronizado**. No confirma el estado **audio preparado**, porque el protocolo no puede demostrar que la pista física correspondiente exista en la microSD.

Si se perdió la response del commit, el frontend se reconecta o consulta `device.status` y compara `activeProfile.profileId` y `activeProfile.profileRevision` con los valores enviados.

### 12.8. Commit incompleto o fallido

Si faltan gestos, `sync.commit` responde `SYNC_INCOMPLETE`, descarta staging y vuelve a `IDLE`.

Si ocurre un error de almacenamiento:

- la response utiliza `STORAGE_ERROR` o `SYNC_FAILED`;
- el perfil anterior debe conservarse si sigue siendo válido;
- el staging se descarta;
- el dispositivo vuelve a `IDLE` si el error es recuperable;
- el dispositivo cambia a `ERROR` si no puede garantizar ningún perfil válido o continuar con seguridad.

Nunca se responde `committed: true` por una biblioteca parcial.

### 12.9. `sync.abort`

Solicitud:

```json
{"v":2,"type":"request","id":"req-14","command":"sync.abort","payload":{"syncId":"sync-a1"}}
```

Respuesta:

```json
{"v":2,"type":"response","id":"req-14","ok":true,"result":{"aborted":true,"syncId":"sync-a1"}}
```

Después emite `device.state` con `IDLE`.

`sync.abort`:

- descarta staging;
- no modifica el perfil activo;
- sólo acepta el `syncId` activo;
- responde `SYNC_NOT_ACTIVE` si no hay sincronización;
- responde `SYNC_ID_MISMATCH` si existe otra sincronización activa.

### 12.10. Biblioteca vacía

Una biblioteca vacía es válida.

Secuencia:

```text
sync.begin con gestureCount = 0
→ sync.commit
```

No se envía `sync.gesture`.

Un commit exitoso reemplaza el perfil anterior por un perfil activo con cero gestos. Esto garantiza que los gestos eliminados del backend también desaparezcan del ESP32.

### 12.11. Interrupción y desconexión

La sincronización se aborta cuando ocurre cualquiera de estos casos:

- `sync.abort` válido;
- vence `idleTimeoutMs` sin un mensaje válido de la transacción;
- se detecta desconexión del transporte;
- se reinicia el ESP32;
- falla la validación de un gesto de la transacción activa;
- `sync.commit` detecta una sincronización incompleta;
- ocurre un fallo que impide confirmar el staging.

Ante timeout, si el canal todavía funciona, el dispositivo emite:

```json
{"v":2,"type":"event","event":"sync.failed","data":{"syncId":"sync-a1","error":{"code":"SYNC_TIMEOUT","message":"Synchronization timed out"}}}
```

Después emite `device.state` con `IDLE`, salvo que el fallo requiera `ERROR`.

El firmware puede no detectar inmediatamente que el navegador cerró el puerto. Por eso `idleTimeoutMs` es obligatorio. En el siguiente arranque, el firmware debe limpiar cualquier staging no confirmado antes de ofrecerlo como válido.

Después de reconectar:

1. el frontend realiza un handshake nuevo;
2. consulta `device.status`;
3. si queda una `activeSync`, puede abortarla usando el `syncId` informado;
4. verifica `activeProfile`;
5. sólo muestra éxito si la revisión esperada quedó activa;
6. de lo contrario reinicia la sincronización completa.

---

## 13. Reconocimiento

Cuando existe una sesión compatible, el dispositivo PUEDE informar un reconocimiento mediante:

```json
{"v":2,"type":"event","event":"recognition.detected","data":{"gestureId":17,"audioTrack":1}}
```

Campos:

| Campo | Tipo | Descripción |
|---|---|---|
| `gestureId` | integer | ID interno del gesto reconocido. |
| `audioTrack` | integer | Pista solicitada al DFPlayer. |

Este evento es:

- informativo;
- de mejor esfuerzo;
- no confirmado;
- prescindible para el funcionamiento normal;
- útil para diagnóstico y visualización.

El firmware:

- reconoce usando el perfil local;
- ordena localmente la reproducción al DFPlayer;
- NO espera una respuesta del frontend;
- NO bloquea el audio para emitir el evento;
- puede omitir el evento si no existe una sesión compatible o el canal no puede enviarlo.

La ausencia del evento no significa que no se reprodujo audio. La presencia del evento tampoco demuestra que el archivo físico exista correctamente en la microSD.

El algoritmo de reconocimiento inicial de MITTEN V2 es el **baseline de V1** (distancia normalizada al centro con rangos mínimos fijos: 400 flex, 20 MPU). Este algoritmo deberá portarse/adaptarse primero para disponer de una versión funcional. Mejoras posteriores (DTW, k-NN, PCA, redes neuronales ligeras, etc.) no bloquean el desarrollo del firmware V2.

---

## 14. Validaciones obligatorias

### 14.1. Frontend

Antes de enviar un mensaje, el frontend valida:

- disponibilidad de Web Serial;
- puerto abierto y sesión vigente;
- handshake compatible;
- estado permitido para el comando;
- `id` nuevo y válido;
- estructura del payload;
- tamaño UTF-8 del frame;
- `gestureCount` dentro de `min(50, maxGestures)`;
- IDs de gesto numéricos y únicos en el perfil;
- nombres de 1 a 60 puntos de código Unicode;
- `audioTrack` dentro del rango permitido;
- `data` conforme a `docs/gesture-format.md`;
- ausencia de una sincronización local competidora.

Al recibir, valida:

- framing y UTF-8;
- JSON objeto;
- envelope y tipos;
- versión;
- `id` asociado a una request pendiente;
- comando/operación esperada;
- nombres de eventos conocidos o ignorables;
- estado y transiciones válidas;
- estructura de `result`, `error` o `data`.

Una response inválida no puede producir un estado de éxito.

### 14.2. Firmware

Antes de ejecutar una request, el firmware valida:

- JSON y envelope;
- `type === "request"`;
- handshake cuando corresponda;
- versión de protocolo;
- ID y comando;
- payload y tipos;
- estado permitido;
- capacidad y tamaño;
- secuencia e identidad de sincronización;
- cada gesto antes de staging;
- perfil completo antes de commit;
- resultado de persistencia antes de confirmar.

El firmware nunca confía en que el frontend ya validó los datos.

### 14.3. Contratos compartidos

`packages/contracts` debe definir para TypeScript:

- envelopes discriminados;
- comandos y eventos;
- estados;
- códigos de error;
- esquemas de payload y result;
- límites centralizados;
- validadores de runtime;
- fixtures válidos e inválidos.

MicroPython no importa directamente TypeScript. El firmware mantiene una implementación equivalente y debe validarse con los mismos fixtures serializados cuando sea práctico.

### 14.4. Reglas JSON adicionales

- El valor superior siempre es un objeto, nunca array, string o null.
- `payload`, `result`, `data`, `error` y `details`, cuando correspondan, son objetos.
- Los campos obligatorios no pueden sustituirse por `null` salvo que la tabla lo permita expresamente.
- Un entero fuera del rango declarado es inválido aunque el parser JSON pueda representarlo.
- Los strings no pueden contener caracteres de control no escapados.

---

## 15. Manejo de errores

### 15.1. Error correlacionado

Si el firmware puede recuperar un `id` válido, responde:

```json
{"v":2,"type":"response","id":"req-20","ok":false,"error":{"code":"UNKNOWN_COMMAND","message":"Unknown command","details":{"command":"device.fly"}}}
```

### 15.2. Error sin correlación

Si después del handshake no puede recuperarse un `id`, utiliza:

```json
{"v":2,"type":"event","event":"protocol.error","data":{"error":{"code":"INVALID_JSON","message":"Unable to parse JSON frame"}}}
```

El frontend no responde a `protocol.error`.

### 15.3. Política de conexión

Durante bootstrap:

- framing inválido;
- UTF-8 inválido;
- JSON inválido;
- frame excesivo;
- respuesta que no cumple el contrato mínimo;

provocan rechazo y cierre del puerto por parte del frontend.

Después del handshake:

- un error recuperable se informa y el puerto permanece abierto;
- el parser se resincroniza en `LF`;
- una request pendiente puede terminar por error o timeout;
- sólo un error de transporte, pérdida de confianza continuada o cierre explícito termina necesariamente la sesión.

### 15.4. Códigos enviados por el dispositivo

| Código | Condición |
|---|---|
| `INVALID_JSON` | La línea no contiene JSON válido. |
| `INVALID_MESSAGE` | El JSON no cumple un envelope permitido. |
| `MESSAGE_TOO_LARGE` | La línea supera `maxMessageBytes`. |
| `INCOMPLETE_MESSAGE` | Un fragmento no terminó antes del timeout. |
| `UNKNOWN_COMMAND` | `command` no está definido en esta versión. |
| `DUPLICATE_REQUEST_ID` | El ID sigue pendiente o identifica una operación activa. |
| `HANDSHAKE_REQUIRED` | Se intentó una operación antes del handshake. |
| `PROTOCOL_INCOMPATIBLE` | El mensaje usa una versión no aceptada para operaciones normales. |
| `INVALID_PAYLOAD` | El payload falta, tiene tipos incorrectos o viola límites generales. |
| `INVALID_STATE` | El comando no puede ejecutarse en el estado actual. |
| `DEVICE_BUSY` | Otra operación exclusiva está en curso. |
| `PROFILE_TOO_LARGE` | `gestureCount` supera 50 o la capacidad anunciada, lo que sea menor. |
| `GESTURE_INVALID` | Un gesto o su `data` no cumple su contrato. |
| `DUPLICATE_GESTURE_ID` | Dos gestos del staging tienen el mismo ID. |
| `SYNC_NOT_ACTIVE` | El comando requiere una sincronización inexistente. |
| `SYNC_ID_MISMATCH` | `syncId` no coincide con la transacción activa. |
| `SYNC_SEQUENCE_INVALID` | `index` no coincide con `nextIndex`. |
| `SYNC_INCOMPLETE` | Se intentó commit sin todos los gestos. |
| `SYNC_TIMEOUT` | Venció el timeout de inactividad de sincronización. |
| `SYNC_FAILED` | Fallo de sincronización no representado por un código más específico. |
| `CAPTURE_FAILED` | Fallo de captura no representado por un código más específico. |
| `SENSOR_ERROR` | Falló la inicialización o lectura de sensores. |
| `STORAGE_ERROR` | Falló una operación de almacenamiento. |
| `INTERNAL_ERROR` | Fallo interno inesperado y controlado. |

Se debe preferir el código más específico. `SYNC_FAILED`, `CAPTURE_FAILED` e `INTERNAL_ERROR` son últimos recursos, no sustitutos de validaciones precisas.

### 15.5. Errores locales del frontend

Estos códigos pertenecen a la capa Web Serial o a la aplicación; no requieren ser enviados por el firmware:

| Código | Condición |
|---|---|
| `WEB_SERIAL_UNAVAILABLE` | El navegador no ofrece Web Serial. |
| `SERIAL_PERMISSION_DENIED` | El usuario denegó la selección o permiso. |
| `SERIAL_OPEN_FAILED` | No pudo abrirse el puerto. |
| `SERIAL_DISCONNECTED` | El puerto se perdió durante la sesión. |
| `REQUEST_TIMEOUT` | No llegó respuesta o evento terminal dentro del plazo. |
| `DEVICE_NOT_MITTEN` | El bootstrap válido identifica otro dispositivo. |
| `PROTOCOL_INCOMPATIBLE` | El handshake informó una versión no soportada. |
| `INVALID_DEVICE_MESSAGE` | El dispositivo emitió un mensaje no válido o contradictorio. |

La UI traduce estos códigos y los códigos del firmware a mensajes comprensibles. No muestra automáticamente el `message` de diagnóstico como única explicación.

### 15.6. Timeouts

Toda espera debe ser finita.

Protocol Version 2 define los siguientes valores:

| Operación | Timeout |
|---|---:|
| Handshake | `5000 ms` |
| Response de una request | `5000 ms` |
| Frame incompleto | `5000 ms` |
| Captura | `15000 ms` |
| Inactividad de sincronización | `10000 ms` |
| `sync.commit` | `10000 ms` |

Los timeouts anunciados explícitamente por el dispositivo, como `operationTimeoutMs` e `idleTimeoutMs`, DEBEN coincidir con estos valores en Protocol Version 2.

Cuando una operación incluya un timeout anunciado por el dispositivo, el frontend utiliza ese valor como referencia operativa para esa operación.

Un timeout local no equivale a éxito ni demuestra que el dispositivo no ejecutó la operación.

Para operaciones que puedan modificar estado, el frontend debe consultar `device.status` cuando corresponda antes de decidir si debe reintentar.

## 16. Ejemplos completos

Los ejemplos de esta sección utilizan los valores normativos de Protocol Version 2:

- `maxMessageBytes = 8192`;
- `operationTimeoutMs = 15000`;
- `idleTimeoutMs = 10000`.

En los ejemplos, `"data": {}` se usa como abreviación del payload de gesto para mantener legibles los ejemplos del protocolo. La estructura completa de `data` está definida en `docs/gesture-format.md`.

### 16.1. Conexión y handshake

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-1","command":"device.handshake","payload":{"client":"MITTEN_WEB","supportedProtocolVersions":[2]}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-1","ok":true,"result":{"device":"MITTEN","firmwareVersion":"2.0.0","protocolVersion":2,"state":"IDLE","capabilities":{"maxGestures":50,"maxMessageBytes":8192}}}
```

Resultado: la aplicación valida identidad y protocolo, y sólo entonces marca MITTEN como conectado.

### 16.2. Consulta de estado

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-2","command":"device.status","payload":{}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-2","ok":true,"result":{"state":"IDLE","activeProfile":null,"activeSync":null,"error":null}}
```

### 16.3. Captura correcta

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-3","command":"capture.start","payload":{}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-3","ok":true,"result":{"accepted":true,"operationTimeoutMs":15000}}
{"v":2,"type":"event","event":"device.state","data":{"state":"CAPTURING"}}
{"v":2,"type":"event","event":"capture.progress","data":{"requestId":"req-3","phase":"PREPARING","progress":100}}
{"v":2,"type":"event","event":"capture.progress","data":{"requestId":"req-3","phase":"RECORDING","progress":50}}
{"v":2,"type":"event","event":"capture.progress","data":{"requestId":"req-3","phase":"RECORDING","progress":100}}
{"v":2,"type":"event","event":"capture.progress","data":{"requestId":"req-3","phase":"PROCESSING","progress":100}}
{"v":2,"type":"event","event":"capture.completed","data":{"requestId":"req-3","data":{}}}
{"v":2,"type":"event","event":"device.state","data":{"state":"IDLE"}}
```

El frontend valida `data` y continúa el guardado mediante HTTP. `GUARDANDO` no es un estado del firmware.

### 16.4. Sincronización correcta con dos gestos

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-10","command":"sync.begin","payload":{"syncId":"sync-a1","profileId":"profile-42","profileRevision":"rev-7","gestureCount":2}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-10","ok":true,"result":{"accepted":true,"syncId":"sync-a1","expectedGestureCount":2,"receivedCount":0,"nextIndex":0,"idleTimeoutMs":10000}}
{"v":2,"type":"event","event":"device.state","data":{"state":"SYNCING"}}
```

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-11","command":"sync.gesture","payload":{"syncId":"sync-a1","index":0,"gesture":{"id":17,"name":"hola","audioTrack":1,"data":{}}}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-11","ok":true,"result":{"syncId":"sync-a1","receivedCount":1,"nextIndex":1}}
```

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-12","command":"sync.gesture","payload":{"syncId":"sync-a1","index":1,"gesture":{"id":23,"name":"gracias","audioTrack":2,"data":{}}}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-12","ok":true,"result":{"syncId":"sync-a1","receivedCount":2,"nextIndex":2}}
```

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-13","command":"sync.commit","payload":{"syncId":"sync-a1"}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-13","ok":true,"result":{"committed":true,"syncId":"sync-a1","activeProfile":{"profileId":"profile-42","profileRevision":"rev-7","gestureCount":2}}}
{"v":2,"type":"event","event":"device.state","data":{"state":"IDLE"}}
```

Sólo después de la response de `sync.commit` el frontend muestra sincronización exitosa.

### 16.5. Sincronización fallida por ID duplicado

Supuesto inicial: el perfil activo es `profile-42`, revisión `rev-6`.

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-20","command":"sync.begin","payload":{"syncId":"sync-b1","profileId":"profile-42","profileRevision":"rev-7","gestureCount":2}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-20","ok":true,"result":{"accepted":true,"syncId":"sync-b1","expectedGestureCount":2,"receivedCount":0,"nextIndex":0,"idleTimeoutMs":10000}}
{"v":2,"type":"event","event":"device.state","data":{"state":"SYNCING"}}
```

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-21","command":"sync.gesture","payload":{"syncId":"sync-b1","index":0,"gesture":{"id":17,"name":"hola","audioTrack":1,"data":{}}}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-21","ok":true,"result":{"syncId":"sync-b1","receivedCount":1,"nextIndex":1}}
```

Frontend → dispositivo, con ID de gesto repetido:

```json
{"v":2,"type":"request","id":"req-22","command":"sync.gesture","payload":{"syncId":"sync-b1","index":1,"gesture":{"id":17,"name":"saludo alternativo","audioTrack":2,"data":{}}}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-22","ok":false,"error":{"code":"DUPLICATE_GESTURE_ID","message":"Gesture ID already exists in staging","details":{"index":1,"gestureId":17}}}
{"v":2,"type":"event","event":"device.state","data":{"state":"IDLE"}}
```

Frontend consulta estado:

```json
{"v":2,"type":"request","id":"req-23","command":"device.status","payload":{}}
```

Dispositivo confirma que la revisión anterior sigue activa:

```json
{"v":2,"type":"response","id":"req-23","ok":true,"result":{"state":"IDLE","activeProfile":{"profileId":"profile-42","profileRevision":"rev-6","gestureCount":2},"activeSync":null,"error":null}}
```

### 16.6. Sincronización interrumpida por desconexión

Antes de la desconexión se alcanzó este punto:

```json
{"v":2,"type":"request","id":"req-30","command":"sync.begin","payload":{"syncId":"sync-c1","profileId":"profile-42","profileRevision":"rev-8","gestureCount":2}}
{"v":2,"type":"response","id":"req-30","ok":true,"result":{"accepted":true,"syncId":"sync-c1","expectedGestureCount":2,"receivedCount":0,"nextIndex":0,"idleTimeoutMs":10000}}
{"v":2,"type":"event","event":"device.state","data":{"state":"SYNCING"}}
{"v":2,"type":"request","id":"req-31","command":"sync.gesture","payload":{"syncId":"sync-c1","index":0,"gesture":{"id":17,"name":"hola","audioTrack":1,"data":{}}}}
{"v":2,"type":"response","id":"req-31","ok":true,"result":{"syncId":"sync-c1","receivedCount":1,"nextIndex":1}}
```

Luego el transporte se desconecta. No existe ningún mensaje de éxito. El frontend produce localmente `SERIAL_DISCONNECTED` y muestra la sincronización como no completada.

El firmware descarta staging al detectar la desconexión, vencer `idleTimeoutMs` o reiniciarse. Al reconectar se realiza un handshake nuevo y se consulta estado. El perfil activo sólo puede ser la revisión válida anterior o, si un commit completo ocurrió antes de perderse el transporte, la revisión nueva completa. Nunca una mezcla parcial.

### 16.7. Error estructurado por comando desconocido

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-40","command":"device.fly","payload":{}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-40","ok":false,"error":{"code":"UNKNOWN_COMMAND","message":"Unknown command","details":{"command":"device.fly"}}}
```

El puerto permanece abierto porque el error es recuperable.

### 16.8. Sincronización de biblioteca vacía

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-50","command":"sync.begin","payload":{"syncId":"sync-empty-1","profileId":"profile-42","profileRevision":"rev-9","gestureCount":0}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-50","ok":true,"result":{"accepted":true,"syncId":"sync-empty-1","expectedGestureCount":0,"receivedCount":0,"nextIndex":0,"idleTimeoutMs":10000}}
{"v":2,"type":"event","event":"device.state","data":{"state":"SYNCING"}}
```

Frontend → dispositivo:

```json
{"v":2,"type":"request","id":"req-51","command":"sync.commit","payload":{"syncId":"sync-empty-1"}}
```

Dispositivo → frontend:

```json
{"v":2,"type":"response","id":"req-51","ok":true,"result":{"committed":true,"syncId":"sync-empty-1","activeProfile":{"profileId":"profile-42","profileRevision":"rev-9","gestureCount":0}}}
{"v":2,"type":"event","event":"device.state","data":{"state":"IDLE"}}
```

---

## 17. Responsabilidades por subsistema

### 17.1. `apps/web`

Es responsable de:

- comprobar soporte de Web Serial;
- solicitar permiso por acción explícita del usuario;
- ser el único propietario del puerto;
- configurar, abrir y cerrar el puerto;
- reconstruir frames fragmentados;
- realizar el handshake;
- validar identidad y compatibilidad;
- generar IDs únicos;
- correlacionar responses;
- mantener timeouts finitos;
- validar todos los mensajes recibidos;
- mantener el estado local de conexión;
- orquestar captura y sincronización;
- validar la biblioteca antes de transferirla;
- no declarar éxito antes de la confirmación correspondiente;
- convertir códigos estables en mensajes de UI.

Los componentes React consumen esta capa centralizada y no abren puertos directamente.

### 17.2. `firmware/esp32`

Es responsable de:

- implementar el parser NDJSON incremental;
- no mezclar logs crudos con el protocolo;
- responder el bootstrap;
- anunciar capacidades reales;
- validar requests y estado;
- ejecutar captura;
- emitir estados y eventos;
- mantener el reconocimiento local autónomo;
- reproducir localmente mediante DFPlayer Mini el `audioTrack` asociado a un gesto reconocido;
- no generar archivos MP3 ni asignar `audioTrack`;
- crear y validar staging;
- activar el perfil de forma segura;
- conservar el perfil anterior ante una sincronización fallida;
- limpiar staging abandonado;
- persistir metadatos del perfil activo;
- usar errores estructurados.

El firmware no conoce JWT, contraseña, API HTTP ni lógica de autorización de usuarios.

### 17.3. `packages/contracts`

Es responsable de representar en TypeScript:

- todos los envelopes;
- payloads y resultados;
- estados y fases;
- comandos y eventos;
- códigos de error;
- límites;
- validadores runtime;
- fixtures de conformidad.

Los contratos no contienen componentes React ni detalles de hardware interno.
`packages/contracts` implementa esta especificación en TypeScript y DEBE mantenerse alineado con los documentos canónicos.

No redefine de forma independiente el protocolo.

Ante una contradicción entre `packages/contracts` y este documento dentro del ámbito del wire protocol, `docs/protocol.md` define el comportamiento esperado.

### 17.4. `tools/esp32-simulator`

El simulador debe ser indistinguible del firmware desde el punto de vista del protocolo para el escenario que simula.

Debe respetar exactamente:

- framing;
- handshake;
- estados;
- correlación;
- orden de eventos;
- validaciones;
- errores;
- transacciones de sincronización;
- timeouts configurados;
- desconexiones simuladas.

Los controles propios del simulador deben existir fuera del protocolo MITTEN, por ejemplo mediante argumentos de proceso, configuración o una interfaz de pruebas separada. No se agregan comandos serie exclusivos del simulador al contrato oficial.

---

## 18. Conformidad y pruebas mínimas

Una implementación conforme debe probar como mínimo:

### Framing

- un frame dividido byte por byte;
- varios frames en una lectura;
- UTF-8 multibyte fragmentado;
- `LF` y `CRLF`;
- línea vacía;
- JSON inválido;
- UTF-8 inválido;
- frame excesivo;
- fragmento incompleto y timeout;
- resincronización en el siguiente `LF`.

### Handshake

- MITTEN V2 compatible;
- identidad distinta;
- dispositivo silencioso;
- protocolo futuro incompatible con bootstrap legible;
- capacidad de 50 gestos;
- estados de inicialización y calibración.

### Correlación

- response con ID correcto;
- response con ID desconocido;
- request ID duplicado activo;
- timeout de request;
- response tardía después del timeout.

### Captura

- captura correcta con fases;
- `data` inválido en frontend;
- error de sensores;
- timeout terminal;
- desconexión durante captura;
- ausencia de doble evento terminal.

### Sincronización

- cero gestos;
- un gesto;
- cincuenta gestos;
- perfil sobre capacidad;
- índice fuera de secuencia;
- ID duplicado;
- gesto inválido;
- commit incompleto;
- abort explícito;
- timeout de inactividad;
- desconexión intermedia;
- reinicio con staging existente;
- error de almacenamiento;
- response perdida de `sync.gesture` resuelta con status;
- response perdida de commit resuelta con `profileRevision`;
- eliminación de gestos mediante reemplazo completo;
- conservación del perfil anterior tras fallo.

### Reconocimiento

- evento diagnóstico válido;
- funcionamiento local sin conexión;
- reproducción no bloqueada por el evento;
- ID de gesto y pista coherentes con el perfil activo.

Los mismos fixtures de mensajes deben poder utilizarse contra el parser del frontend, el firmware y el simulador cuando sea práctico.

---

## 19. Seguridad y límites de confianza

- Todo dato recibido se considera no confiable.
- El frontend valida mensajes del dispositivo.
- El firmware valida mensajes del frontend.
- El backend validará de nuevo los datos de captura.
- `profileId` no es una prueba de autorización.
- El ESP32 no recibe contraseña, JWT ni credenciales de base de datos.
- Los mensajes de error no exponen secretos.
- El protocolo no autentica criptográficamente el dispositivo en esta versión.
- El permiso Web Serial y la selección del puerto siguen perteneciendo al navegador y al usuario.

La identificación `device: "MITTEN"` evita confundir accidentalmente dispositivos, pero no constituye una garantía criptográfica contra suplantación.

---

## 20. Evolución compatible

Dentro de Protocol Version 2 se permite:

- agregar campos opcionales;
- agregar eventos que clientes anteriores puedan ignorar;
- agregar códigos de error más específicos sin cambiar la semántica de los existentes;
- ampliar capabilities opcionales.

Requiere una nueva versión:

- cambiar NDJSON por otro framing;
- renombrar o eliminar campos obligatorios;
- cambiar el significado de `ok`;
- cambiar la correlación por `id`;
- cambiar la semántica transaccional de `sync.commit`;
- permitir que una sincronización parcial se vuelva activa;
- cambiar tipos de datos obligatorios;
- romper el bootstrap mínimo.

El bootstrap mínimo debe preservarse incluso al incrementar la versión funcional.

---

## 21. Decisiones aún abiertas

Las siguientes decisiones internas siguen abiertas y no modifican el contrato observable de Protocol Version 2.

### 21.1. Persistencia atómica interna

La estructura física exacta utilizada por el ESP32 sigue siendo una decisión de implementación.

Esto incluye, por ejemplo:

- nombres de archivos;
- archivos temporales;
- doble buffer;
- estrategia de rename;
- puntero al perfil activo;
- recuperación física ante corrupción.

La implementación elegida DEBE cumplir la semántica definida en `docs/synchronization.md` y nunca puede hacer visible una biblioteca parcial como perfil válido.

### 21.2. Tuning físico de captura

Los parámetros iniciales definidos son:

- `samplingPeriodMs = 100`;
- `captureDurationMs = 1500`;
- cantidad esperada aproximada de muestras: `15`.

Estos valores están definidos en `docs/gesture-format.md`.

Pueden ajustarse posteriormente mediante pruebas con el hardware real, siempre que cualquier cambio que afecte contratos existentes se documente correctamente.

### 21.3. Decisiones ya cerradas

No son decisiones abiertas:

- `maxMessageBytes = 8192`;
- handshake timeout = `5000 ms`;
- request timeout = `5000 ms`;
- incomplete frame timeout = `5000 ms`;
- capture timeout = `15000 ms`;
- synchronization idle timeout = `10000 ms`;
- `sync.commit` timeout = `10000 ms`;
- NDJSON UTF-8 delimitado por `LF`;
- Protocol Version 2;
- envelopes `request`, `response` y `event`;
- correlación mediante `id`;
- identificación de sincronización mediante `syncId`;
- estados `INITIALIZING`, `CALIBRATING`, `IDLE`, `CAPTURING`, `SYNCING` y `ERROR`;
- `recognition.detected` como evento informativo de reconocimiento;
- ausencia de estado persistente `RECOGNIZING`;
- sincronización `sync.begin → sync.gesture × N → sync.commit/abort`;
- reemplazo completo del perfil;
- un único perfil activo;
- conservación del perfil anterior ante fallo;
- biblioteca vacía válida;
- `audioTrack` dentro del rango `1..50`;
- asignación de `audioTrack` mediante first-fit;
- independencia entre `gesture.id` y `audioTrack`;
- recuperación desde `ERROR` mediante reinicio del ESP32;
- formato de gesto definido por `docs/gesture-format.md`.
- `state === SYNCING` implica que `activeSync` es distinto de `null`;

## 22. Resumen del contrato
```text
Transporte      = USB Serial 115200, UTF-8, NDJSON + LF
Versión         = Protocol 2
Frame máximo    = 8192 bytes
Bootstrap       = device.handshake estable entre versiones
Handshake       = timeout 5000 ms
Correlación     = id por request
Request         = timeout general 5000 ms
Operación sync  = syncId por transacción
Estados         = INITIALIZING | CALIBRATING | IDLE | CAPTURING | SYNCING | ERROR
Captura         = request aceptada + progreso + evento terminal; timeout 15000 ms
Sincronización  = begin → gesture × N → commit/abort; idle timeout 10000 ms
Commit          = timeout 10000 ms
Persistencia    = perfil anterior válido hasta commit seguro
Reconocimiento  = local; recognition.detected sólo informativo
ERROR           = device.status permitido; recuperación mediante reinicio
Audio           = backend prepara MP3; firmware reproduce mediante DFPlayer Mini
Errores         = códigos estables + texto diagnóstico
Simulador       = mismo protocolo observable que firmware real