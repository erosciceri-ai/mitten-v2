# MITTEN V2 -- Architecture

## 1. Propósito

Este documento define la arquitectura técnica de MITTEN V2.

Su objetivo es establecer:

- cómo está dividido el sistema;
- qué responsabilidad tiene cada subsistema;
- cómo se comunican los componentes;
- dónde vive cada tipo de lógica;
- cómo se sincroniza el guante con la aplicación;
- cómo se mantiene compatibilidad entre software y firmware;
- qué dependencias están permitidas entre módulos.

Los requisitos funcionales y de producto se encuentran en `docs/requirements.md`.

Este documento describe **cómo está construido el sistema**, no qué funcionalidades debe ofrecer al usuario.

---

# 2. Visión general

MITTEN es un sistema compuesto por hardware, firmware y software que permite capturar, almacenar y reconocer gestos realizados con un guante electrónico.

La arquitectura de MITTEN V2 está dividida en cinco componentes principales:

1. Aplicación web.
2. API/backend.
3. Firmware del ESP32.
4. Contratos compartidos.
5. Simulador de ESP32.

La estructura general es:

```text
                    ┌───────────────────────────┐
                    │          Usuario          │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │          Web App          │
                    │    React + TypeScript     │
                    │         apps/web          │
                    └──────────┬───────┬────────┘
                               │       │
                       HTTP/JSON│       │Web Serial
                               │       │
                               ▼       ▼
                ┌──────────────────┐   ┌─────────────────────┐
                │       API        │   │       ESP32         │
                │ Node + Express   │   │    MicroPython      │
                │    apps/api      │   │  firmware/esp32     │
                └────────┬─────────┘   └──────────┬──────────┘
                         │                        │
                         ▼                        ▼
                ┌──────────────────┐     ┌───────────────────┐
                │ Base de datos    │     │ Sensores / Audio  │
                │                  │     │ Flex + MPU6050     │
                │ usuarios         │     │ DFPlayer Mini      │
                │ gestos           │     │                   │
                └──────────────────┘     └───────────────────┘
```

La aplicación web actúa como intermediario entre el backend y el guante.

El backend no se comunica directamente con el ESP32.

---

# 3. Estructura del repositorio

MITTEN V2 utiliza un repositorio organizado por subsistemas.

```text
mitten/
│
├── apps/
│   ├── web/
│   │   └── Aplicación frontend
│   │
│   └── api/
│       └── Backend HTTP
│
├── firmware/
│   └── esp32/
│       └── Firmware MicroPython
│
├── packages/
│   └── contracts/
│       └── Contratos compartidos
│
├── tools/
│   └── esp32-simulator/
│       └── Simulador del protocolo del ESP32
│
├── docs/
│   ├── requirements.md
│   ├── architecture.md
│   ├── protocol.md
│   ├── gesture-format.md
│   ├── README.md
│   └── ...
│
└── AGENTS.md
```

Cada subsistema debe poder entenderse y probarse de forma relativamente independiente.

---

# 4. Principios arquitectónicos

MITTEN V2 adopta los siguientes principios.

## 4.1 Separación de responsabilidades

Cada componente debe tener una responsabilidad clara.

El frontend no debe contener reglas de persistencia.

El backend no debe depender de detalles internos del firmware.

El firmware no debe conocer conceptos propios de la interfaz web.

Los contratos compartidos deben definir la forma de los datos intercambiados sin contener lógica específica de una aplicación.

---

## 4.2 El backend es la fuente de verdad de la biblioteca de gestos

La biblioteca persistente de gestos de un usuario vive en el backend.

El ESP32 mantiene una copia local del perfil actualmente sincronizado.

Por lo tanto:

```text
Backend
   │
   │ fuente de verdad
   ▼
Biblioteca de gestos del usuario
   │
   │ sincronización
   ▼
ESP32
```

Modificar solamente la copia del ESP32 no modifica automáticamente la biblioteca almacenada en el backend.

---

## 4.3 Un solo perfil activo en el guante

El ESP32 mantiene solamente un perfil de usuario activo.

El dispositivo no funciona como una base de datos multiusuario.

La identidad del usuario autenticado pertenece a la aplicación y al backend.

Durante una sincronización, la biblioteca local anterior del ESP32 se reemplaza por la biblioteca correspondiente al usuario actual.

---

## 4.4 Sincronización determinista

La sincronización debe producir un estado conocido.

MITTEN V2 no realiza una sincronización incremental gesto por gesto como mecanismo principal.

La estrategia es:

```text
Backend
    │
    │ biblioteca completa del usuario
    ▼
Frontend
    │
    │ reemplazo completo
    ▼
ESP32
```

Después de una sincronización exitosa:

```text
biblioteca_local_ESP32 == biblioteca_backend_usuario
```

Esto implica que si un gesto fue eliminado del backend, también desaparece del ESP32 después de sincronizar.

---

## 4.5 Protocolos versionados

La comunicación con el ESP32 utiliza un protocolo explícitamente versionado.

El firmware debe informar al conectarse:

- identidad del dispositivo;
- versión del firmware;
- versión del protocolo.

El frontend debe validar la compatibilidad antes de iniciar operaciones.

---

# 5. Aplicación web

Ubicación:

```text
apps/web
```

Tecnologías base:

```text
React
Vite
TypeScript
```

La aplicación web es la interfaz principal del usuario.

También actúa como puente entre el backend y el ESP32.

---

# 6. Responsabilidades del frontend

El frontend es responsable de:

- autenticación desde la interfaz;
- gestión de sesión;
- consumir la API HTTP;
- mostrar la biblioteca de gestos;
- permitir crear, editar y eliminar gestos;
- conectar con MITTEN mediante Web Serial;
- realizar el handshake del dispositivo;
- comprobar compatibilidad de protocolo;
- iniciar capturas de gestos;
- recibir muestras o resultados provenientes del ESP32;
- iniciar la sincronización;
- informar al usuario del estado de las operaciones.

El frontend no debe implementar el algoritmo principal de reconocimiento del guante.

El reconocimiento durante el funcionamiento normal pertenece al firmware.

---

# 7. Backend

Ubicación:

```text
apps/api
```

Tecnología base:

```text
Node.js
Express
TypeScript
```

El backend proporciona la API utilizada por la aplicación web.

---

# 8. Responsabilidades del backend

El backend es responsable de:

- usuarios;
- autenticación;
- autorización;
- persistencia;
- biblioteca de gestos;
- asociación de gestos con usuarios;
- validación de datos recibidos;
- asignación y almacenamiento de identificadores;
- proporcionar al frontend el perfil que debe sincronizarse.

La API no debe:

- acceder directamente al puerto serie;
- controlar sensores;
- ejecutar el reconocimiento físico de gestos;
- depender de que un ESP32 esté conectado.

---

# 9. Persistencia

La persistencia pertenece al backend.

Como mínimo deben existir conceptos equivalentes a:

```text
User
Gesture
```

Un usuario puede poseer múltiples gestos.

```text
User
  │
  └── 0..50 Gestures
```

El límite inicial de MITTEN V2 es:

```text
50 gestos por usuario
```

La aplicación debe evitar superar ese límite.

---

# 10. Identidad de los gestos

Cada gesto posee un identificador interno numérico.

Ejemplo conceptual:

```json
{
  "id": 17,
  "name": "hola"
}
```

El nombre visible del gesto no debe utilizarse como identificador interno.

Esto permite:

- cambiar nombres sin romper referencias;
- evitar conflictos entre nombres;
- mantener relaciones estables;
- asociar pistas de audio de forma determinista.

---

# 11. Audio

Cada gesto sincronizable posee una asociación con una pista del DFPlayer.

Conceptualmente:

```text
gesture_id
     │
     ▼
audio_track
```

Ejemplo:

```text
gesture_id: 17
audio_track: 17
```

No debe asumirse que el nombre del archivo de audio es la identidad del gesto.

La asignación de audio debe manejarse mediante identificadores estables.

**Política de `audioTrack` (resuelta):**
- Rango: 1–50.
- Asignación: first-fit por backend en creación; inmutable tras asignación.
- Al borrar gesto: `audioTrack` liberado y reutilizable.
- Al editar `name`: se regenera el MP3 en la misma pista; estado "audio preparado" invalidado hasta recopiar a microSD.

**Convención DFPlayer (resuelta):**
- Carpeta física: `/mp3/` en la raíz de la microSD.
- Nomenclatura: `{audioTrack:04d}.mp3` (p.ej. `0001.mp3`, `0017.mp3`, `0050.mp3`).
- Reproducción: `playMp3Folder(audioTrack)` — selección explícita por número de pista dentro de `/mp3`, independiente del orden de copia en FAT.

El mecanismo para preparar/transferir los archivos físicos a la microSD del DFPlayer es un proceso separado de la sincronización de datos (ver `docs/protocol.md` §12.5 y `docs/synchronization.md`).

---

# 12. Firmware

Ubicación:

```text
firmware/esp32
```

Tecnología:

```text
MicroPython
```

El firmware controla directamente el hardware del guante.

---

# 13. Responsabilidades del firmware

El firmware es responsable de:

- inicialización del dispositivo;
- lectura de sensores flex;
- lectura del MPU6050;
- almacenamiento de la biblioteca local;
- captura de nuevos gestos;
- reconocimiento;
- control del DFPlayer;
- reproducción de audio;
- comunicación Serial;
- procesamiento de comandos recibidos;
- envío de eventos y respuestas;
- almacenamiento del perfil activo;
- informar versión e identidad del dispositivo.

El firmware debe poder ejecutar el modo normal del guante sin requerir conexión permanente con el backend.

---

# 14. Hardware lógico

El flujo principal de datos físicos es:

```text
Flex 1 ─┐
Flex 2 ─┤
Flex 3 ─┤
Flex 4 ─┼──► ESP32 ───► reconocimiento
Flex 5 ─┤                    │
        │                    ▼
MPU6050 ┘                DFPlayer
                             │
                             ▼
                          Parlante
```

Los sensores proporcionan información sobre:

- flexión de los dedos;
- orientación;
- movimiento.

El ESP32 procesa estas señales para determinar el gesto realizado.

---

# 15. Comunicación ESP32 ↔ aplicación

La conexión entre el navegador y MITTEN utiliza:

```text
USB Serial
115200 baud
Web Serial API
```

La aplicación web es responsable de abrir y cerrar la conexión.

---

# 16. Handshake

Antes de ejecutar cualquier operación, el frontend debe identificar el dispositivo.

Secuencia conceptual:

```text
Frontend                         ESP32
   │                               │
   │──── solicitud handshake ─────►│
   │                               │
   │◄──── información MITTEN ──────│
   │                               │
   │   valida protocolo/versiones  │
```

La respuesta debe permitir conocer como mínimo:

```text
device
firmware_version
protocol_version
```

Ejemplo conceptual:

```json
{
  "device": "MITTEN",
  "firmwareVersion": "2.0.0",
  "protocolVersion": 2
}
```

La estructura exacta debe ser definida en los contratos del protocolo.

---

# 17. Validación de compatibilidad

El frontend nunca debe asumir que cualquier dispositivo serie conectado es MITTEN.

Debe comprobar:

```text
device == MITTEN
```

y además validar:

```text
protocol_version
```

Si la versión del protocolo no es compatible, las operaciones deben bloquearse.

Ejemplo:

```text
MITTEN detectado
Firmware: 2.1.0
Protocol: 2
Frontend soporta Protocol: 2

→ conexión permitida
```

Ejemplo incompatible:

```text
MITTEN detectado
Protocol: 3

Frontend soporta Protocol: 2

→ conexión rechazada
```

---

# 18. Contratos compartidos

Ubicación:

```text
packages/contracts
```

Este paquete contiene definiciones compartidas entre subsistemas.

Puede incluir:

- tipos de Gesture;
- estructuras de sincronización;
- payloads de API;
- códigos de error;
- versiones de protocolo;
- tipos de mensajes;
- esquemas de validación.

Ejemplo conceptual:

```text
Gesture
SyncProfile
DeviceInfo
ProtocolMessage
ApiError
```

Los contratos no deben depender de componentes de UI ni de detalles internos del firmware.

---

# 19. Contratos y MicroPython

El código TypeScript de `packages/contracts` no puede ejecutarse directamente en MicroPython.

Por lo tanto, los contratos compartidos representan la especificación lógica común, pero el firmware mantiene una implementación equivalente compatible con Python/MicroPython.

Debe evitarse duplicar reglas arbitrariamente.

Los formatos intercambiados deben estar documentados de forma suficientemente precisa para que ambas implementaciones produzcan y consuman los mismos datos.

---

# 20. Sincronización de gestos

La sincronización utiliza una estrategia de reemplazo completo.

Flujo:

```text
Usuario
   │
   ▼
Frontend
   │
   │ GET biblioteca
   ▼
Backend
   │
   │ devuelve perfil completo
   ▼
Frontend
   │
   │ valida datos
   │
   │ Web Serial
   ▼
ESP32
   │
   │ reemplaza biblioteca local
   ▼
Nuevo perfil activo
```

No debe quedar una mezcla entre gestos del usuario anterior y del usuario nuevo.

---

# 21. Proceso de sincronización

Conceptualmente:

```text
1. Conectar MITTEN.
2. Ejecutar handshake.
3. Verificar protocolo.
4. Descargar biblioteca desde API.
5. Validar límite y estructura.
6. Iniciar sincronización (sync.begin).
7. Transferir gestos (sync.gesture × N).
8. ESP32 valida cada gesto.
9. Confirmar (sync.commit) o abortar (sync.abort).
10. Frontend informa éxito solo tras response de sync.commit.
```

Una sincronización fallida no debe dejar silenciosamente una biblioteca parcial considerada válida.

La semántica transaccional completa (`sync.begin → sync.gesture × N → sync.commit/abort`), staging, timeouts (`idleTimeoutMs`), recuperación ante interrupciones (timeout, reconexión, `device.status` para verificar `profileRevision`) y conservación del perfil anterior están definidas en `docs/protocol.md`, sección 12.

La implementación física interna de persistencia atómica en el ESP32 (archivos, doble buffer, rename, recuperación ante corrupción) sigue siendo una decisión abierta documentada en `docs/gesture-format.md` (OPEN DECISION 2) y se detallará en `docs/synchronization.md` cuando se cree.

---

# 22. Perfil sincronizable

El frontend transforma la representación del backend en una representación adecuada para firmware, usando los conceptos definidos por el protocolo:

- `profileId`
- `profileRevision`
- `gestureCount`
- biblioteca de gestos (ver `docs/protocol.md`, sección 12.2 y 12.4)

La estructura exacta de `data` pertenece al contrato del gesto.

---

# 23. Captura de un nuevo gesto

La captura involucra al frontend, ESP32 y backend.

Flujo conceptual:

```text
Usuario
   │
   │ Crear gesto
   ▼
Frontend
   │
   │ comando de captura
   ▼
ESP32
   │
   │ lee sensores
   │ procesa muestras
   ▼
Datos del gesto
   │
   ▼
Frontend
   │
   │ HTTP
   ▼
Backend
   │
   ▼
Base de datos
```

El ESP32 genera los datos físicos.

El backend almacena la representación persistente.

---

# 24. Reconocimiento

El reconocimiento debe ejecutarse localmente en el guante durante su funcionamiento normal.

```text
Sensores
   │
   ▼
lectura
   │
   ▼
normalización/procesamiento
   │
   ▼
comparación con biblioteca local
   │
   ▼
gesto reconocido
   │
   ▼
audioTrack
   │
   ▼
DFPlayer
```

Esto evita que el guante necesite conexión constante con:

- navegador;
- computadora;
- Internet;
- backend.

---

# 25. Simulador ESP32

Ubicación:

```text
tools/esp32-simulator
```

El simulador reproduce el comportamiento relevante de comunicación del firmware sin requerir hardware físico.

Debe permitir desarrollar y probar:

- handshake;
- mensajes;
- errores;
- sincronización;
- estados;
- compatibilidad de protocolo.

Su objetivo no es simular con precisión física los sensores.

Su objetivo principal es simular la interfaz lógica del ESP32.

---

# 26. Uso del simulador

Arquitectura durante desarrollo:

```text
                 ┌──────────────┐
                 │   Frontend   │
                 └──────┬───────┘
                        │
               interfaz equivalente
                        │
                ┌───────▼────────┐
                │ ESP32 Simulator│
                └────────────────┘
```

Esto permite avanzar sobre software incluso cuando el hardware no está disponible.

El simulador y el firmware real deben respetar el mismo protocolo.

---

# 27. Estados de dispositivo

Las operaciones largas deben exponer estados explícitos.

Los estados oficiales de Protocol Version 2 son:

| Estado | Significado |
|---|---|
| `INITIALIZING` | El firmware está preparando servicios y almacenamiento. |
| `CALIBRATING` | El dispositivo calibra los sensores necesarios. |
| `IDLE` | No hay una operación exclusiva; puede aceptar captura o sincronización. |
| `CAPTURING` | Existe una captura de gesto en curso. |
| `SYNCING` | Existe una transacción de sincronización en staging. |
| `ERROR` | Un fallo impide operar con seguridad hasta recuperación o reinicio. |

`DISCONNECTED` no es un estado del firmware. Es un estado local del frontend cuando no existe una sesión Web Serial válida.

`RECOGNIZING` **no es un estado oficial**. El reconocimiento normal ocurre localmente mientras el dispositivo está `IDLE` y puede notificarse mediante el evento `recognition.detected` (ver `docs/protocol.md`, secciones 9 y 13).

No se debe depender únicamente de textos destinados al usuario para determinar el estado interno.

Los estados utilizados por el protocolo deben ser códigos o valores estables. La lista completa y normativa está en `docs/protocol.md`, sección 9.

---

# 28. Errores

Los errores deben poder clasificarse.

Ejemplos:

```text
DEVICE_NOT_MITTEN
PROTOCOL_INCOMPATIBLE
SERIAL_DISCONNECTED
INVALID_MESSAGE
SYNC_FAILED
PROFILE_TOO_LARGE
GESTURE_INVALID
STORAGE_ERROR
SENSOR_ERROR
```

El firmware debe enviar información estructurada suficiente para que el frontend pueda decidir cómo actuar.

Los mensajes visuales para el usuario pertenecen al frontend.

---

# 29. Dependencias permitidas

Las dependencias principales son:

```text
apps/web
 ├── packages/contracts
 └── apps/api mediante HTTP

apps/api
 └── packages/contracts

tools/esp32-simulator
 └── packages/contracts

firmware/esp32
 └── implementación compatible con la especificación del protocolo
```

No debe existir:

```text
apps/api → apps/web
```

ni:

```text
firmware → apps/api
```

ni:

```text
firmware → apps/web
```

El ESP32 conoce únicamente el protocolo con el que se comunica.

---

# 30. Flujo completo del sistema

```text
                           INTERNET / LOCALHOST
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                ▼                                 ▼
       ┌─────────────────┐               ┌─────────────────┐
       │     Web App     │──── HTTP ─────►│       API       │
       │                 │◄───────────────│                 │
       └────────┬────────┘               └────────┬────────┘
                │                                 │
                │                                 ▼
                │                         ┌─────────────────┐
                │                         │    Database     │
                │                         └─────────────────┘
                │
                │ Web Serial / USB
                │
                ▼
       ┌─────────────────┐
       │      ESP32      │
       └───────┬─────────┘
               │
        ┌──────┴─────────────┐
        │                    │
        ▼                    ▼
   ┌─────────┐          ┌─────────┐
   │ Sensores│          │DFPlayer │
   └─────────┘          └────┬────┘
                             │
                             ▼
                         ┌─────────┐
                         │Parlante │
                         └─────────┘
```

---

# 31. Funcionamiento offline

Una vez sincronizado, el funcionamiento principal del guante debe ser local.

El reconocimiento sigue el flujo:

```text
sensores
   ↓
ESP32
   ↓
biblioteca local
   ↓
reconocimiento
   ↓
DFPlayer
   ↓
audio
```

No se requiere conexión al backend durante esta operación.

La aplicación y el backend son necesarios principalmente para:

- administrar gestos;
- crear gestos;
- actualizar perfiles;
- sincronizar el dispositivo.

---

# 32. Pruebas

Las pruebas deben mantenerse cerca del subsistema que verifican.

Ejemplo:

```text
apps/web/
  src/
  tests/

apps/api/
  src/
  tests/

tools/esp32-simulator/
  src/
  tests/
```

No se requiere una carpeta global única `tests/`.

Los tipos de prueba pueden incluir:

### Frontend

- lógica de conexión;
- parsing del protocolo;
- compatibilidad de versiones;
- flujos de sincronización;
- componentes críticos.

### Backend

- autenticación;
- autorización;
- repositorios;
- servicios;
- endpoints;
- límites de gestos.

### Protocolos

- mensajes válidos;
- mensajes inválidos;
- interrupciones;
- handshake;
- sincronización.

### Firmware

Cuando sea posible:

- parsing;
- serialización;
- reconocimiento;
- almacenamiento;
- manejo de estados.

---

# 33. Versionado

MITTEN distingue como mínimo dos versiones diferentes.

## Firmware version

Representa la versión del software instalado en el ESP32.

Ejemplo:

```text
2.1.0
```

## Protocol version

Representa la versión del contrato de comunicación.

Ejemplo:

```text
2
```

Cambiar firmware no implica necesariamente cambiar protocolo.

Por ejemplo:

```text
Firmware 2.1.0 → Protocol 2
Firmware 2.2.0 → Protocol 2
Firmware 3.0.0 → Protocol 3
```

---

# 34. Evolución de contratos

Un cambio requiere incrementar la versión del protocolo cuando rompe compatibilidad con implementaciones anteriores.

Ejemplos:

```text
cambiar nombre de un campo obligatorio
eliminar un comando
cambiar estructura de sincronización
cambiar semántica de una respuesta
```

Agregar información opcional compatible no necesariamente requiere una nueva versión mayor del protocolo.

---

# 35. Seguridad

Las credenciales y tokens pertenecen al entorno web/backend.

No deben almacenarse permanentemente en el ESP32 salvo que una futura arquitectura lo requiera explícitamente.

El ESP32 no necesita conocer:

- contraseña del usuario;
- JWT;
- credenciales de base de datos.

La autorización de acceso a la biblioteca se realiza antes de que el frontend entregue el perfil al dispositivo.

---

# 36. Límites de confianza

El backend debe tratar los datos recibidos desde clientes como no confiables.

El frontend debe tratar las respuestas serie como datos externos que deben validarse.

El firmware debe validar los mensajes antes de modificar su almacenamiento.

Por lo tanto:

```text
API
↑ valida
Frontend
↑ valida
ESP32
```

Ningún subsistema debe asumir que los datos recibidos son válidos simplemente porque provienen de otro componente de MITTEN.

---

# 37. Decisiones explícitamente fuera de esta arquitectura

Este documento no define:

- diseño visual final de la aplicación;
- PCB;
- diseño mecánico del guante;
- carcasa;
- posición física de componentes;
- mecanismo definitivo de transferencia de archivos de audio.

El formato físico de la microSD para DFPlayer **sí está definido** en la sección 11: carpeta `/mp3/`, archivos `{audioTrack:04d}.mp3`, reproducción vía `playMp3Folder(audioTrack)`.

El protocolo serie completo mensaje por mensaje **sí está definido** en `docs/protocol.md`.

Estos temas deben documentarse en archivos específicos cuando corresponda.

---

# 38. Documentos derivados

A partir de esta arquitectura existen o deberían existir los siguientes documentos:

```text
docs/
├── requirements.md
├── architecture.md
├── protocol.md          ← EXISTE (canónico)
├── gesture-format.md    ← EXISTE (canónico)
├── synchronization.md   ← EXISTE (persistencia atómica ESP32)
├── calibration.md       ← PENDIENTE (offsets MPU, rangos flex)
└── development.md       ← PENDIENTE (guía desarrollo, testing)
```

`protocol.md` define exactamente la comunicación entre frontend y ESP32 (autoridad canónica).

`gesture-format.md` define la estructura interna de un gesto `data` (autoridad canónica).

`synchronization.md` documenta la persistencia atómica interna en el ESP32: formato `gestures.json`, staging NDJSON en `gestures.staging`, commit atómico vía `gestures.json.tmp` + `rename` (LittleFS), recovery en boot, y políticas de abort/timeout.

`calibration.md` documentará offsets MPU, rangos flex y estrategia de calibración.

---

# 39. Resumen de responsabilidades

| Componente | Responsabilidad principal |
|---|---|
| `apps/web` | Interfaz, API client y conexión Web Serial |
| `apps/api` | Usuarios, autenticación y persistencia |
| `firmware/esp32` | Sensores, reconocimiento, almacenamiento local y audio |
| `packages/contracts` | Contratos compartidos |
| `tools/esp32-simulator` | Simular comportamiento lógico del ESP32 |
| `docs` | Especificación y decisiones técnicas |

La regla principal de la arquitectura puede resumirse como:

```text
Backend = fuente de verdad

Frontend = coordinador

ESP32 = dispositivo autónomo de ejecución

Contracts = lenguaje compartido

Simulator = reemplazo del hardware durante desarrollo
