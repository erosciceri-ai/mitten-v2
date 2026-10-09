# Requisitos oficiales de MITTEN V2

## 1. Propósito del documento

Este documento define los requisitos funcionales y no funcionales de MITTEN V2.

MITTEN es un guante electrónico capaz de registrar gestos realizados por una persona, aprender una representación de esos gestos y reconocerlos posteriormente para reproducir una frase mediante audio.

MITTEN V2 debe conservar este objetivo principal y corregir los problemas funcionales y arquitectónicos observados en MITTEN V1. La implementación V1 se considera una referencia de comportamiento, no una arquitectura que deba conservarse automáticamente.

Este documento establece **qué debe hacer el sistema**. No define todavía la estructura interna de clases, componentes o módulos, ni selecciona todas las tecnologías o formatos definitivos.

## 2. Alcance del sistema

MITTEN V2 comprende:

- El guante físico y sus sensores.
- El firmware ejecutado en el ESP32.
- El reconocimiento local de gestos.
- La reproducción autónoma mediante DFPlayer Mini y parlante.
- Una aplicación web para usuarios, gestos, aprendizaje y sincronización.
- Un backend para autenticación, persistencia, biblioteca de gestos, generación de audio y datos de sincronización.
- La comunicación USB Serial entre el navegador y el ESP32 mediante Web Serial API.
- El almacenamiento local en el ESP32 de una copia sincronizada de los gestos.
- La preparación separada de la microSD utilizada por el DFPlayer Mini.

## 3. Principios y decisiones confirmadas

### 3.1. Funcionamiento autónomo

- **REQ-AUT-001:** Después de su configuración y sincronización, MITTEN debe reconocer gestos previamente configurados sin una PC conectada.
- **REQ-AUT-002:** Después de reconocer un gesto, el ESP32 debe ordenar al DFPlayer Mini reproducir la pista correspondiente.
- **REQ-AUT-003:** Durante el uso autónomo, el recorrido funcional debe ser:

  ```text
  Sensores
  → ESP32
  → reconocimiento del gesto
  → DFPlayer Mini
  → parlante
  ```

- **REQ-AUT-004:** El backend, el frontend, el navegador y la PC no deben ser necesarios para reconocer ni reproducir gestos previamente configurados durante el uso normal.

### 3.2. Fuente principal de datos

- **REQ-DAT-001:** La biblioteca almacenada por la aplicación y el backend debe ser la fuente principal de los gestos de cada usuario.
- **REQ-DAT-002:** El ESP32 debe conservar una copia local de los gestos necesarios para el funcionamiento autónomo.
- **REQ-DAT-003:** La copia local del ESP32 debe obtenerse mediante un proceso explícito de sincronización.
- **REQ-DAT-004:** El flujo conceptual de datos debe ser:

  ```text
  Backend
  → sincronización
  → almacenamiento local del ESP32
  → reconocimiento autónomo
  ```

### 3.3. Sincronización por reemplazo completo

- **REQ-SYN-001:** La sincronización debe comportarse como reemplazo completo y seguro de la biblioteca local del ESP32 con la biblioteca sincronizable del usuario en el backend.
- **REQ-SYN-002:** Los gestos nuevos en el backend deben agregarse a la biblioteca local del ESP32.
- **REQ-SYN-003:** Los gestos modificados en el backend deben actualizarse en la biblioteca local del ESP32.
- **REQ-SYN-004:** Los gestos eliminados del backend deben eliminarse también de la biblioteca local del ESP32.
- **REQ-SYN-005:** No se implementará inicialmente una sincronización incremental compleja; la operación es de reemplazo completo.
- **REQ-SYN-006:** Una sincronización fallida no debe destruir silenciosamente la última biblioteca válida del ESP32.
- **REQ-SYN-007:** El ESP32 debe conservar la biblioteca válida anterior hasta que la nueva sincronización pueda confirmarse correctamente.
- **REQ-SYN-008:** La sincronización y persistencia del perfil deben cumplir la estrategia de staging, commit seguro, conservación del perfil anterior y recuperación definida en `docs/synchronization.md`.

### 3.4. Un solo perfil activo en el guante

- **REQ-PRF-001:** El ESP32 debe mantener un único perfil de usuario activo almacenado localmente.
- **REQ-PRF-002:** El backend puede tener múltiples usuarios, cada uno con su propia biblioteca.
- **REQ-PRF-003:** El perfil local del ESP32 corresponde al usuario que fue sincronizado más recientemente.
- **REQ-PRF-004:** Sincronizar otro usuario reemplaza el perfil local anterior.
- **REQ-PRF-005:** No se almacenarán inicialmente múltiples perfiles simultáneos en el ESP32.
- **REQ-PRF-006:** El sistema identifica qué perfil corresponde a la biblioteca sincronizada mediante `profileId` y `profileRevision`, definidos en `docs/protocol.md` (sección 12.2).

### 3.5. Simplicidad apropiada al proyecto

- **REQ-GEN-001:** MITTEN V2 debe ser apropiado para un proyecto escolar y un prototipo funcional.
- **REQ-GEN-002:** No debe incorporarse complejidad propia de sistemas empresariales si no aporta valor demostrable al proyecto.
- **REQ-GEN-003:** Las decisiones deben priorizar una solución simple, correcta, comprensible y mantenible por un equipo pequeño.

### 3.6. Tecnología de firmware confirmada

- **REQ-FIR-001:** **MicroPython es la tecnología seleccionada para el firmware de MITTEN V2** que se ejecuta en el ESP32.
- **REQ-FIR-002:** El firmware V1 monolítico es solo una referencia; el firmware V2 debe ser modular y mantenible.

## 4. Usuarios y autenticación

- **REQ-USR-001:** El sistema debe permitir registrar usuarios.
- **REQ-USR-002:** El sistema debe permitir que un usuario registrado inicie sesión.
- **REQ-USR-003:** Las funciones privadas de la aplicación deben requerir una sesión autenticada.
- **REQ-USR-004:** Cada usuario debe tener su propia biblioteca de gestos.
- **REQ-USR-005:** Un usuario no debe poder acceder, modificar ni eliminar gestos pertenecientes a otro usuario.
- **REQ-USR-006:** El backend debe aplicar la autorización sobre cada operación relacionada con gestos; no debe confiar únicamente en restricciones de la interfaz.
- **REQ-USR-007:** El cierre o vencimiento de una sesión debe impedir el acceso posterior a funciones privadas hasta una nueva autenticación.
- **REQ-USR-008:** Cuando Google Identity Services esté configurado, el sistema debe permitir crear o recuperar una sesión MITTEN mediante un ID token verificado por el backend.
- **REQ-USR-009:** Una cuenta MITTEN existente no debe vincularse automáticamente por coincidencia de correo; la vinculación con Google requiere una sesión MITTEN autenticada y el mismo correo verificado.
- **REQ-USR-010:** La ausencia o indisponibilidad de Google no debe impedir el registro y el inicio de sesión con correo y contraseña.
- **REQ-USR-011:** Un usuario autenticado debe poder exportar una copia versionada de los datos públicos de su cuenta y de su biblioteca completa, sin incluir hashes de contraseña, credenciales ni identificadores internos de proveedores externos.

## 5. Biblioteca y gestión de gestos

- **REQ-GES-001:** No deben existir ocho gestos obligatorios ni una biblioteca inicial fija impuesta al usuario.
- **REQ-GES-002:** Cada usuario debe poder decidir qué gestos crear y conservar en su biblioteca.
- **REQ-GES-003:** Un usuario autenticado debe poder crear un gesto.
- **REQ-GES-004:** Un usuario autenticado debe poder listar sus gestos.
- **REQ-GES-005:** Un usuario autenticado debe poder buscar gestos en su biblioteca.
- **REQ-GES-006:** Un usuario autenticado debe poder ver la información disponible de un gesto.
- **REQ-GES-007:** Un usuario autenticado debe poder eliminar uno de sus gestos.
- **REQ-GES-008:** Un usuario autenticado debe poder escuchar o previsualizar desde la aplicación el audio asociado a un gesto.
- **REQ-GES-009:** Un usuario autenticado debe poder sincronizar sus gestos con MITTEN.
- **REQ-GES-010:** Los datos de un gesto deben validarse estructuralmente antes de almacenarse o sincronizarse.
- **REQ-GES-011:** La aplicación debe identificar claramente los gestos que no puedan sincronizarse por datos faltantes o inválidos.
- **REQ-GES-012:** La política de edición de gestos está definida: `gesture.id` y `audioTrack` son inmutables mientras exista el gesto; `name` y `data` pueden modificarse; el MP3 asociado puede regenerarse.
- **REQ-GES-013:** Editar un gesto no implica sincronización incremental. Después de modificar `name` o `data`, la siguiente sincronización continúa siendo un reemplazo completo del perfil.
- **REQ-GES-014:** Cada gesto debe tener un identificador interno independiente del nombre o frase visible; no se utilizará el texto del gesto como identidad técnica principal.
- **REQ-GES-015:** La identidad técnica del gesto está definida: `id` integer (1–2147483647), asignado por el backend, único dentro del perfil. Permite mantener relaciones entre gesto, datos de reconocimiento, audio, sincronización y pista DFPlayer.
- **REQ-GES-016:** Cada gesto sincronizado debe tener asociada una pista del DFPlayer de forma inequívoca.
- **REQ-GES-017:** Cada gesto debe utilizar un `audioTrack` dentro del rango `1–50`. La pista es independiente de `gesture.id` y corresponde al archivo `/mp3/{audioTrack:04d}.mp3` de la microSD del DFPlayer Mini.
- **REQ-GES-018:** El límite máximo inicial es de 50 gestos por usuario/perfil activo, aplicable tanto a la biblioteca sincronizable como a la biblioteca local del ESP32.
- **REQ-GES-019:** La aplicación debe poder representar la capacidad, por ejemplo: `23 / 50 gestos`.
- **REQ-GES-020:** El límite de 50 gestos es una decisión inicial del prototipo y debe poder cambiarse en versiones futuras sin rediseñar todo el sistema.
- **REQ-GES-021:** La aplicación debe validar que no se sincronicen más gestos que la capacidad declarada por el ESP32 durante el handshake.
- **REQ-GES-022:** Si la biblioteca supera la capacidad declarada, la sincronización debe rechazarse antes de transferir los gestos, mostrando un error claro; no debe enviarse una biblioteca parcial sin conocimiento del usuario.

## 6. Sensores y captura

- **REQ-SEN-001:** El sistema debe utilizar cinco sensores flex para medir el estado de los dedos.
- **REQ-SEN-002:** El sistema debe utilizar un MPU6050 para medir información de orientación o movimiento de la mano.
- **REQ-SEN-003:** La representación actual de referencia utiliza siete dimensiones principales:
  1. Flex 1.
  2. Flex 2.
  3. Flex 3.
  4. Flex 4.
  5. Flex 5.
  6. Orientación X.
  7. Orientación Y.
- **REQ-SEN-004:** El sistema debe poder inicializar y calibrar los sensores necesarios antes de capturar o reconocer gestos.
- **REQ-SEN-005:** La aplicación debe informar al usuario cuando el dispositivo esté inicializando o calibrando sus sensores.
- **REQ-SEN-006:** Los errores de lectura o inicialización de sensores no deben ocultarse como lecturas válidas sin informar el fallo.
- **REQ-SEN-007:** La definición de datos de un gesto debe admitir validación y versionado.
- **REQ-SEN-008:** Las siete dimensiones existentes se consideran un punto de partida y no impiden una evolución justificada de la representación.
- **REQ-SEN-009:** Los offsets de calibración del MPU6050 pertenecen al estado o configuración local del dispositivo y no deben almacenarse dentro de `GestureData`.
- **REQ-SEN-010:** La calibración debe aplicarse antes de producir los valores utilizados para captura y reconocimiento.

## 7. Aprendizaje y creación de un gesto

- **REQ-APR-001:** El usuario debe poder introducir el nombre, texto o frase asociada al gesto que desea crear.
- **REQ-APR-002:** La aplicación debe solicitar explícitamente al ESP32 que inicie una captura.
- **REQ-APR-003:** El ESP32 debe capturar los datos de los sensores durante el proceso de aprendizaje.
- **REQ-APR-004:** El ESP32 debe generar una representación del gesto a partir de la captura.
- **REQ-APR-005:** El ESP32 debe devolver a la aplicación el resultado de la captura o un error explícito.
- **REQ-APR-006:** La aplicación debe validar la estructura del resultado antes de enviarlo al backend.
- **REQ-APR-007:** El backend debe validar nuevamente los datos recibidos antes de persistirlos.
- **REQ-APR-008:** El backend debe asociar el gesto al usuario autenticado.
- **REQ-APR-009:** Al crear el gesto, el sistema debe generar un archivo de audio correspondiente a su texto, nombre o frase asociada.
- **REQ-APR-010:** La biblioteca mostrada al usuario debe actualizarse después de una creación exitosa.
- **REQ-APR-011:** Un gesto creado debe poder sincronizarse posteriormente al ESP32.
- **REQ-APR-012:** La aplicación debe presentar estados claros durante el aprendizaje. Los estados oficiales del firmware están definidos en `docs/protocol.md` (sección 9): `INITIALIZING`, `CALIBRATING`, `IDLE`, `CAPTURING`, `SYNCING`, `ERROR`. Las fases de captura (`PREPARING`, `RECORDING`, `PROCESSING`) son eventos de progreso, no estados persistentes. Los estados de interfaz (`Desconectado`, `Conectado`, `Guardando`, `Completado`, `Error`) son conceptos de UI, no estados del firmware.
- **REQ-APR-013:** Los nombres y códigos definitivos de los estados oficiales del firmware y las fases de captura están definidos en `docs/protocol.md` (secciones 9 y 11.4). Los estados de interfaz son responsabilidad de la UI.
- **REQ-APR-014:** El límite máximo inicial para el nombre, texto o frase asociada a un gesto es de 60 puntos de código Unicode; la aplicación y el backend deben validar este límite.
- **REQ-APR-015:** El límite de 60 puntos de código Unicode debe mantenerse consistente entre frontend, backend, firmware y contratos compartidos. `packages/contracts` implementa esta regla para TypeScript y debe mantenerse alineado con los documentos canónicos.

## 8. Reconocimiento de gestos

- **REQ-REC-001:** El reconocimiento de gestos debe ejecutarse localmente en el ESP32.
- **REQ-REC-002:** El backend, el frontend y la PC no deben participar obligatoriamente en el reconocimiento durante el uso normal.
- **REQ-REC-003:** El reconocimiento debe utilizar información de los cinco sensores flex y del MPU6050.
- **REQ-REC-004:** El algoritmo de reconocimiento de MITTEN V1 debe utilizarse como baseline inicial de MITTEN V2. Podrá reemplazarse o mejorarse posteriormente mediante comparación contra resultados reproducibles.
- **REQ-REC-005:** Antes de reemplazar el algoritmo de V1, su comportamiento debe documentarse y poder probarse con muestras conocidas.
- **REQ-REC-006:** Las alternativas de reconocimiento deben poder compararse con el comportamiento de referencia.
- **REQ-REC-007:** MITTEN V2 debe permitir mejorar el reconocimiento sin requerir la reconstrucción completa de la aplicación.
- **REQ-REC-008:** Un resultado de reconocimiento debe identificar inequívocamente el gesto y la pista de audio que corresponde solicitar al DFPlayer.
- **REQ-REC-009:** Los errores de sensores, datos corruptos o gestos no reconocidos no deben provocar la reproducción silenciosa de una pista incorrecta.

## 9. Conexión USB Serial y Web Serial

- **REQ-SER-001:** La comunicación entre la aplicación y el ESP32 debe utilizar USB Serial y Web Serial API.
- **REQ-SER-002:** El frontend React debe iniciar la conexión con el ESP32 mediante Web Serial.
- **REQ-SER-003:** Web Serial debe ser el único propietario del puerto serie en MITTEN V2.
- **REQ-SER-004:** MITTEN V2 no debe incluir `monitor.py`.
- **REQ-SER-005:** MITTEN V2 no debe incluir un bridge local para controlar el puerto serie.
- **REQ-SER-006:** No debe haber múltiples componentes o páginas abriendo independientemente el mismo puerto COM.
- **REQ-SER-007:** Toda la comunicación Web Serial debe pasar por una única capa centralizada del frontend.
- **REQ-SER-008:** Los componentes y páginas deben consumir las capacidades de esa capa centralizada y no implementar conexiones serie propias.
- **REQ-SER-009:** La velocidad inicial de comunicación debe ser 115200 baudios.
- **REQ-SER-010:** La velocidad sólo debe cambiarse si existe una razón técnica comprobada y documentada.
- **REQ-SER-011:** El ESP32 no necesita conectarse directamente al backend mediante Wi-Fi.
- **REQ-SER-012:** La sincronización debe recorrer:

  ```text
  Backend
  → Frontend
  → Web Serial
  → ESP32
  ```

- **REQ-SER-013:** El aprendizaje debe devolver los datos mediante:

  ```text
  ESP32
  → Web Serial
  → Frontend
  → Backend
  ```

### 9.1. Handshake al conectar MITTEN

- **REQ-HSH-001:** Abrir correctamente un puerto serie no debe ser suficiente para considerar que MITTEN está conectado.
- **REQ-HSH-002:** Después de abrir el puerto mediante Web Serial, la aplicación debe realizar un handshake con el ESP32.
- **REQ-HSH-003:** El handshake debe confirmar como mínimo:
  - Que el dispositivo conectado es MITTEN.
  - La versión del firmware.
  - La versión del protocolo serie.
  - La capacidad máxima de gestos soportada por el dispositivo.
- **REQ-HSH-004:** El formato exacto del handshake está definido en `docs/protocol.md` (sección 8). El handshake usa `device.handshake` y devuelve `device`, `firmwareVersion`, `protocolVersion`, `state` y `capabilities` (incluyendo `maxGestures` y `maxMessageBytes`).

### 9.2. Compatibilidad entre frontend y firmware

- **REQ-CMP-001:** La aplicación debe utilizar la versión del protocolo obtenida durante el handshake para determinar si puede comunicarse correctamente con el firmware.
- **REQ-CMP-002:** Si la versión del protocolo es compatible, la conexión puede continuar normalmente.
- **REQ-CMP-003:** Si la versión del protocolo no es compatible:
  - La aplicación no debe intentar ejecutar operaciones que puedan producir resultados incorrectos.
  - Debe informar claramente al usuario.
  - Puede indicar que el firmware o la aplicación necesita actualizarse.
- **REQ-CMP-004:** La versión del firmware debe mostrarse o quedar disponible para diagnóstico, pero la compatibilidad debe depender principalmente de la versión del protocolo.
- **REQ-CMP-005:** No se diseñarán reglas complejas de versionado semántico; solo queda establecido el requisito. La compatibilidad se define por `protocolVersion` (ver `docs/protocol.md`, sección 3 y 8.4).

## 10. Estado del dispositivo

- **REQ-EST-001:** La aplicación debe mostrar claramente si MITTEN está desconectado.
- **REQ-EST-002:** La aplicación sólo debe mostrar MITTEN como conectado después de confirmar comunicación real con el ESP32 mediante el handshake (ver **REQ-HSH-001** a **REQ-HSH-004**).
- **REQ-EST-003:** La aplicación debe representar el estado de inicialización del dispositivo.
- **REQ-EST-004:** La aplicación debe representar el estado de calibración.
- **REQ-EST-005:** Durante el flujo de aprendizaje, la aplicación debe representar el estado `CAPTURING` y las fases de captura `PREPARING`, `RECORDING` y `PROCESSING` definidas por el protocolo.
- **REQ-EST-006:** La aplicación debe representar el estado de sincronización.
- **REQ-EST-007:** La aplicación debe representar errores de comunicación o firmware.
- **REQ-EST-008:** La aplicación debe indicar cuándo una operación terminó correctamente.
- **REQ-EST-009:** El Dashboard y otras pantallas no deben mostrar estados ficticios, como `Online`, sin confirmación real del dispositivo.
- **REQ-EST-010:** El estado visible debe actualizarse cuando el dispositivo se desconecte o la comunicación deje de responder.

## 11. Protocolo serie

- **REQ-PRO-001:** MITTEN V2 debe definir formalmente un protocolo de comunicación entre el frontend y el ESP32.
- **REQ-PRO-002:** El protocolo está documentado en `docs/protocol.md`.
- **REQ-PRO-003:** El protocolo contempla como mínimo:
  - Conexión e inicialización (handshake).
  - Consulta de estado (`device.status`).
  - Solicitud de grabación (`capture.start`).
  - Estados de grabación (`capture.progress` con fases `PREPARING`, `RECORDING`, `PROCESSING`).
  - Resultado de grabación (`capture.completed` / `capture.failed`).
  - Reconocimiento exitoso mediante el evento informativo `recognition.detected`.
  - Inicio, progreso y finalización de sincronización (`sync.begin`, `sync.gesture`, `sync.commit`, `sync.abort`).
  - Confirmaciones y correlación por `id` y `syncId`.
  - Errores estructurados con códigos estables.
- **REQ-PRO-004:** Cada operación debe producir una confirmación, un resultado o un error predecible.
- **REQ-PRO-005:** La aplicación debe poder asociar una respuesta con la operación que la originó (correlación por `id`).
- **REQ-PRO-006:** Las respuestas recibidas deben validarse antes de modificar el estado de la aplicación o persistir datos.
- **REQ-PRO-007:** Los mensajes de depuración no deben confundirse con mensajes funcionales del protocolo.
- **REQ-PRO-008:** Los mensajes de MITTEN V1, incluidos `STATUS:`, `JSON:`, `OK`, `ERROR:`, `GRABAR:`, `SYNC_START`, `SYNC_ADD` y `SYNC_END`, son referencias y no requisitos inmutables.
- **REQ-PRO-009:** El protocolo usa Protocol Version 2 y admite evolución explícita (ver `docs/protocol.md`, sección 3 y 20).

## 12. Manejo de errores de comunicación

- **REQ-ERR-001:** El sistema debe detectar e informar un ESP32 desconectado.
- **REQ-ERR-002:** El sistema debe detectar e informar un puerto cerrado inesperadamente.
- **REQ-ERR-003:** El sistema debe informar cuando el puerto solicitado esté ocupado o no pueda abrirse.
- **REQ-ERR-004:** La aplicación debe manejar el rechazo del permiso Web Serial por parte del usuario.
- **REQ-ERR-005:** Toda operación que espere una respuesta debe tener un timeout finito y apropiado.
- **REQ-ERR-006:** La aplicación debe detectar respuestas inválidas o no reconocidas.
- **REQ-ERR-007:** Los errores informados por el firmware deben llegar a la interfaz de forma comprensible.
- **REQ-ERR-008:** Una desconexión durante una grabación debe cancelar la operación y evitar el guardado de datos incompletos.
- **REQ-ERR-009:** Una desconexión durante una sincronización debe cancelar la operación y mostrar que no se completó.
- **REQ-ERR-010:** La interfaz no debe quedar indefinidamente en estados como `Grabando`, `Procesando` o `Sincronizando` por ausencia de respuesta.
- **REQ-ERR-011:** Después de un error o desconexión, la aplicación debe liberar los recursos serie que pueda liberar de forma segura.
- **REQ-ERR-012:** Después de un error recuperable, el usuario debe poder intentar reconectar el dispositivo.
- **REQ-ERR-013:** Los errores no deben convertirse silenciosamente en estados de éxito.
- **REQ-ERR-014:** Protocol Version 2 utiliza los siguientes timeouts: handshake `5000 ms`, response individual `5000 ms`, frame incompleto `5000 ms`, captura `15000 ms`, inactividad de sincronización `10000 ms` y `sync.commit` `10000 ms`, conforme a `docs/protocol.md`.

## 13. Sincronización de datos

- **REQ-SIN-001:** La aplicación debe permitir sincronizar la biblioteca del usuario autenticado con MITTEN.
- **REQ-SIN-002:** Antes de sincronizar, la aplicación debe comprobar que el guante esté conectado y responda.
- **REQ-SIN-003:** Antes de enviar un gesto, la aplicación debe validar que sus datos sean aptos para la versión de firmware y protocolo utilizada.
- **REQ-SIN-004:** La aplicación debe indicar claramente cuándo comenzó la sincronización.
- **REQ-SIN-005:** La aplicación debe conocer y mostrar cuántos gestos deben sincronizarse.
- **REQ-SIN-006:** La aplicación debe poder informar cuántos gestos fueron enviados o procesados.
- **REQ-SIN-007:** El ESP32 debe confirmar si la sincronización terminó correctamente o informar un error.
- **REQ-SIN-008:** La aplicación sólo debe mostrar una sincronización exitosa después de recibir la confirmación correspondiente del ESP32.
- **REQ-SIN-009:** Una sincronización incompleta no debe dejar silenciosamente al ESP32 en un estado incoherente.
- **REQ-SIN-010:** Si una sincronización falla, el dispositivo debe conservar un conjunto de gestos identificable como válido o informar explícitamente que no puede utilizar la nueva copia.
- **REQ-SIN-011:** La sincronización debe transferir datos de gestos y sus identificadores de pista, pero no se exige que transfiera automáticamente los MP3 a la microSD.
- **REQ-SIN-012:** La sincronización debe comportarse como reemplazo completo de la biblioteca local (ver **REQ-SYN-001** a **REQ-SYN-008** en la sección 3.3).
- **REQ-SIN-013:** MITTEN V2 no debe sincronizar toda la biblioteca mediante un único JSON gigantesco; la sincronización usa una transacción gesto a gesto: `sync.begin → sync.gesture × N → sync.commit/abort` (ver `docs/protocol.md`, sección 12).
- **REQ-SIN-014:** La sincronización incluye recuperación observable ante interrupciones: timeout de inactividad (`idleTimeoutMs`), reconexión con `device.status` para verificar `activeProfile.profileRevision`, y staging descartado ante fallo (ver `docs/protocol.md`, secciones 12.6, 12.8, 12.11).

## 14. Persistencia local en el ESP32

- **REQ-PER-001:** Los gestos sincronizados deben permanecer disponibles después de reiniciar el ESP32.
- **REQ-PER-002:** Los gestos sincronizados deben permanecer disponibles después de desconectar la PC.
- **REQ-PER-003:** Los gestos sincronizados deben permanecer disponibles después de cerrar el navegador.
- **REQ-PER-004:** Los gestos sincronizados deben permanecer disponibles después de apagar y volver a encender el guante.
- **REQ-PER-005:** El almacenamiento local debe detectar o rechazar datos incompatibles o corruptos en lugar de utilizarlos silenciosamente.
- **REQ-PER-006:** El formato local debe ser versionable y confiable.
- **REQ-PER-007:** El formato actual `gestos.json` de MITTEN V1 no es un requisito de MITTEN V2.

## 15. Backend

- **REQ-BAC-001:** Debe existir un backend responsable de los usuarios.
- **REQ-BAC-002:** El backend debe gestionar la autenticación y autorización.
- **REQ-BAC-003:** El backend debe persistir los gestos y su asociación con cada usuario.
- **REQ-BAC-004:** El backend debe proporcionar las operaciones necesarias para gestionar la biblioteca de gestos.
- **REQ-BAC-005:** El backend debe generar o preparar los archivos MP3 asociados a los gestos y mantener los metadatos necesarios para relacionarlos con su `audioTrack`.
- **REQ-BAC-006:** El backend debe proporcionar al frontend los datos necesarios para la sincronización.
- **REQ-BAC-007:** El backend debe validar todas las entradas externas relevantes.
- **REQ-BAC-008:** La dirección técnica confirmada para MITTEN V2 es:
  - **Node.js**
  - **Express**
  - **TypeScript**
  - **SQLite**
- **REQ-BAC-009:** SQLite se considera suficiente para el alcance actual del proyecto.
- **REQ-BAC-010:** No introducir PostgreSQL, MongoDB, Redis, microservicios o infraestructura cloud compleja sin una necesidad futura demostrada.

## 16. Audio y DFPlayer Mini

- **REQ-AUD-001:** MITTEN V2 debe utilizar el DFPlayer Mini para la reproducción autónoma de audio.
- **REQ-AUD-002:** El recorrido de reproducción autónoma debe ser:

  ```text
  ESP32
  → DFPlayer Mini
  → microSD
  → parlante
  ```

- **REQ-AUD-003:** Cuando el ESP32 reconozca un gesto, debe ordenar al DFPlayer reproducir la pista asociada.
- **REQ-AUD-004:** La PC no debe reproducir el audio durante el funcionamiento normal autónomo del guante.
- **REQ-AUD-005:** El navegador puede permitir escuchar o previsualizar audios desde la interfaz, de manera independiente a la reproducción autónoma.
- **REQ-AUD-006:** Al crear un gesto, `apps/api` debe generar o preparar un archivo MP3 correspondiente al texto, nombre o frase asociada.
- **REQ-AUD-007:** El archivo generado debe quedar relacionado con el gesto y estar disponible para previsualización desde la aplicación.
- **REQ-AUD-008:** Cada gesto debe asociarse inequívocamente a un identificador de archivo o pista que el ESP32 pueda solicitar al DFPlayer.
- **REQ-AUD-009:** El identificador necesario para la reproducción autónoma debe formar parte de los datos sincronizados al ESP32.
- **REQ-AUD-010:** `audioTrack` es un integer lógico dentro del rango `1–50`, independiente de `gesture.id`. El backend lo asigna mediante first-fit al crear el gesto; permanece inmutable mientras exista el gesto; se libera al eliminarlo y puede reutilizarse posteriormente. La pista corresponde a `/mp3/{audioTrack:04d}.mp3`.

### 16.1. Estados diferenciados de un gesto

- **REQ-AUD-011:** La aplicación debe diferenciar claramente entre tres estados independientes de un gesto:
  1. **Gesto guardado:** existe correctamente en la biblioteca del usuario dentro del backend.
  2. **Gesto sincronizado:** los datos necesarios para reconocimiento y reproducción están incluidos en la biblioteca actualmente sincronizada al ESP32.
  3. **Audio preparado:** el archivo correspondiente fue preparado y colocado correctamente en la microSD utilizada por el DFPlayer.
- **REQ-AUD-012:** Estos estados no significan lo mismo; un gesto puede estar guardado y sincronizado, pero sin audio preparado.
- **REQ-AUD-013:** En ese caso, el ESP32 podría reconocer el gesto, pero el DFPlayer podría no poder reproducir el audio correctamente.
- **REQ-AUD-014:** La interfaz debe evitar afirmar simplemente que un gesto está "listo" cuando no pueda demostrarlo.
- **REQ-AUD-015:** Debido a las limitaciones actuales del DFPlayer, la aplicación puede no ser capaz de comprobar directamente el contenido real de la microSD.
- **REQ-AUD-016:** Por lo tanto, el estado de audio podrá depender inicialmente de información registrada por el usuario o del proceso de preparación de la microSD; el mecanismo exacto se decidirá posteriormente.

## 17. Limitación conocida: gestión de la microSD

- **REQ-MSD-001:** En esta versión no se exige transferir automáticamente los MP3 desde la aplicación hasta la microSD del DFPlayer Mini.
- **REQ-MSD-002:** La carga de archivos de audio a la microSD debe tratarse como un proceso separado de la sincronización de datos.
- **REQ-MSD-003:** El sistema y su documentación deben diferenciar claramente:

  ```text
  SINCRONIZACIÓN DE DATOS
  Backend → Frontend → ESP32

  GESTIÓN DE AUDIOS
  Backend genera MP3 → procedimiento separado → microSD del DFPlayer
  ```

- **REQ-MSD-004:** La documentación de uso debe explicar que un gesto puede estar sincronizado en el ESP32 y, aun así, no reproducirse correctamente si la pista correspondiente no fue colocada en la microSD.
- **REQ-MSD-005:** No debe diseñarse en esta fase hardware nuevo para resolver esta limitación.
- **REQ-MSD-006:** El procedimiento exacto para preparar o actualizar la microSD queda pendiente de diseño.
- **REQ-MSD-007:** La numeración de pistas del DFPlayer utiliza `audioTrack` dentro del rango `1–50`. Cada pista corresponde al archivo `/mp3/{audioTrack:04d}.mp3` de la microSD.

## 18. Flujos funcionales

### 18.1. Flujo A — Registro e inicio de sesión

```text
Usuario
→ aplicación
→ registro o inicio de sesión
→ backend
→ sesión autenticada
→ biblioteca personal
```

Resultado esperado: el usuario accede únicamente a su biblioteca y a las operaciones autorizadas para su cuenta.

### 18.2. Flujo B — Conectar MITTEN

```text
Usuario pulsa conectar
→ navegador solicita permiso Web Serial
→ usuario selecciona MITTEN
→ aplicación abre el puerto
→ aplicación confirma comunicación con el ESP32
→ interfaz muestra el dispositivo conectado
```

Resultado esperado: el estado conectado sólo se presenta después de confirmar comunicación real, no solamente después de seleccionar o abrir el puerto.

### 18.3. Flujo C — Crear gesto

```text
Usuario introduce frase o nombre
→ solicita grabación
→ ESP32 captura sensores
→ ESP32 genera y devuelve los datos
→ aplicación valida los datos
→ backend valida y guarda el gesto para el usuario
→ backend genera el audio
→ biblioteca se actualiza
```

Resultado esperado: el gesto, sus datos y su audio quedan asociados al usuario autenticado; cualquier fallo interrumpe el flujo con un estado de error claro.

### 18.4. Flujo D — Sincronizar

```text
Usuario conecta MITTEN
→ aplicación obtiene la biblioteca
→ aplicación valida los gestos
→ inicia la sincronización
→ envía los gestos y sus identificadores de pista
→ ESP32 guarda una copia local
→ ESP32 confirma el resultado
→ aplicación muestra sincronización exitosa
```

Resultado esperado: el ESP32 conserva una copia local válida y la aplicación conoce el resultado real de la operación.

### 18.5. Flujo E — Uso autónomo

```text
PC desconectada
→ usuario realiza un gesto
→ sensores
→ ESP32
→ algoritmo de reconocimiento
→ gesto identificado
→ identificador de audio
→ DFPlayer Mini
→ parlante
```

Resultado esperado: un gesto configurado y sincronizado puede reconocerse y reproducirse sin participación de la PC.

### 18.6. Flujo F — Error de conexión

```text
Operación en curso
→ ESP32 se desconecta
→ Web Serial detecta el error
→ operación se cancela
→ aplicación libera recursos
→ interfaz informa el error
→ usuario puede reconectar
```

Resultado esperado: la aplicación no queda bloqueada ni informa éxito para una operación interrumpida.

## 19. Seguridad

- **REQ-SEG-001:** Las contraseñas nunca deben almacenarse en texto plano.
- **REQ-SEG-002:** Los secretos, credenciales y claves privadas deben permanecer fuera del repositorio.
- **REQ-SEG-003:** Cada usuario sólo debe acceder a sus propios gestos.
- **REQ-SEG-004:** Las entradas del API deben validarse antes de procesarse.
- **REQ-SEG-005:** Los datos de gestos deben validarse estructuralmente.
- **REQ-SEG-006:** Los errores internos no deben exponerse innecesariamente al cliente.
- **REQ-SEG-007:** Los identificadores recibidos del cliente no deben considerarse prueba de propiedad de un recurso.
- **REQ-SEG-008:** Los archivos o referencias de audio deben validarse antes de almacenarse, servirse o eliminarse.

## 20. Pruebas y validación

- **REQ-PRU-001:** MITTEN V2 debe introducir pruebas automatizadas progresivamente.
- **REQ-PRU-002:** Debe poder probarse sin hardware real el registro de usuarios.
- **REQ-PRU-003:** Debe poder probarse sin hardware real el inicio de sesión.
- **REQ-PRU-004:** Debe poder probarse sin hardware real la autorización entre usuarios.
- **REQ-PRU-005:** Debe poder probarse sin hardware real la creación y eliminación de gestos.
- **REQ-PRU-006:** Debe poder probarse sin hardware real la validación estructural de datos de gestos.
- **REQ-PRU-007:** Debe poder probarse sin hardware real la serialización y deserialización de gestos.
- **REQ-PRU-008:** Debe poder probarse sin hardware real la interpretación del protocolo serie.
- **REQ-PRU-009:** Deben poder probarse sin hardware real los estados de conexión y desconexión.
- **REQ-PRU-010:** Deben poder probarse sin hardware real los timeouts y las respuestas inválidas.
- **REQ-PRU-011:** Deben poder probarse sin hardware real los errores durante grabación y sincronización.
- **REQ-PRU-012:** El simulador del ESP32 es una herramienta oficial de MITTEN V2; se ubicará conceptualmente en `tools/esp32-simulator/` y permitirá desarrollar y probar la aplicación sin conectar físicamente MITTEN.
- **REQ-PRU-013:** El simulador debe permitir simular: handshake, estados de calibración, grabación, sincronización, errores de protocolo y desconexiones.
- **REQ-PRU-014:** Las pruebas del algoritmo de reconocimiento deben utilizar muestras conocidas y resultados esperados.
- **REQ-PRU-015:** Los cambios importantes en el reconocimiento deben compararse contra un comportamiento de referencia documentado.

## 21. Validación con hardware real

- **REQ-HAR-001:** El hardware físico debe utilizarse para validar los cinco sensores flex.
- **REQ-HAR-002:** El hardware físico debe utilizarse para validar el MPU6050.
- **REQ-HAR-003:** El hardware físico debe utilizarse para validar la calibración.
- **REQ-HAR-004:** El hardware físico debe utilizarse para validar la captura de gestos.
- **REQ-HAR-005:** El hardware físico debe utilizarse para validar el reconocimiento.
- **REQ-HAR-006:** El hardware físico debe utilizarse para validar la comunicación USB Serial.
- **REQ-HAR-007:** El hardware físico debe utilizarse para validar el DFPlayer Mini y el parlante.
- **REQ-HAR-008:** El desarrollo cotidiano del frontend y del backend no debe depender permanentemente de disponer del guante físico.

## 22. Requisitos no funcionales

MITTEN V2 debe priorizar, en este orden general:

1. Fiabilidad.
2. Simplicidad.
3. Mantenibilidad.
4. Capacidad de prueba.
5. Claridad del código.
6. Funcionamiento autónomo.
7. Recuperación ante errores.
8. Compatibilidad con el hardware real.

### 22.1. Fiabilidad

- **REQ-NF-REL-001:** Las operaciones críticas deben terminar con éxito confirmado o con un error explícito.
- **REQ-NF-REL-002:** Los datos persistidos no deben quedar silenciosamente en un estado parcial o incoherente.
- **REQ-NF-REL-003:** El sistema debe conservar una copia local válida de los gestos ante reinicios y desconexiones.

### 22.2. Simplicidad y mantenibilidad

- **REQ-NF-MAN-001:** Cada responsabilidad principal debe tener un propietario claro.
- **REQ-NF-MAN-002:** La comunicación serie no debe duplicarse entre componentes de interfaz.
- **REQ-NF-MAN-003:** Las decisiones técnicas deben poder comprenderse y mantenerse por un equipo pequeño.
- **REQ-NF-MAN-004:** No deben incorporarse servicios o infraestructura sin una necesidad demostrada.

### 22.3. Capacidad de prueba

- **REQ-NF-TST-001:** La lógica que no dependa físicamente de sensores o periféricos debe poder probarse de forma automatizada.
- **REQ-NF-TST-002:** El protocolo, los estados y los errores deben poder simularse sin hardware real.
- **REQ-NF-TST-003:** El reconocimiento debe poder evaluarse con conjuntos de muestras reproducibles.

### 22.4. Recuperación ante errores

- **REQ-NF-ERR-001:** Un error de comunicación no debe requerir reiniciar toda la aplicación para volver a conectar cuando la recuperación sea técnicamente posible.
- **REQ-NF-ERR-002:** Ninguna espera de comunicación debe ser indefinida.
- **REQ-NF-ERR-003:** La interfaz debe proporcionar información suficiente para que el usuario comprenda si debe reintentar, reconectar o revisar el dispositivo.

### 22.5. Compatibilidad

- **REQ-NF-COM-001:** La solución debe ser compatible con el ESP32, los cinco sensores flex, el MPU6050, el DFPlayer Mini, la microSD y el parlante definidos para el prototipo.
- **REQ-NF-COM-002:** Cualquier cambio que afecte al hardware existente debe justificarse y validarse con el dispositivo real.

### 22.6. Compatibilidad Web Serial

- **REQ-NF-WSB-001:** La aplicación web tendrá como objetivo inicial navegadores compatibles con Web Serial API: **Chrome y Edge modernos**.
- **REQ-NF-WSB-002:** El sistema depende de la disponibilidad de Web Serial; la interfaz debe informar claramente cuando Web Serial no esté disponible en el navegador.
- **REQ-NF-WSB-003:** Cuando la aplicación no se ejecute en `localhost`, deberá utilizar un contexto seguro (HTTPS) cuando el navegador lo requiera para Web Serial.
- **REQ-NF-WSB-004:** No se diseñarán todavía mecanismos alternativos de comunicación (Bluetooth, WebUSB, etc.).

## 23. Fuera de alcance actual

Quedan explícitamente fuera del alcance actual de MITTEN V2:

- Una aplicación móvil nativa.
- El funcionamiento mediante Wi-Fi directo entre el ESP32 y el backend.
- Bluetooth como sistema principal de sincronización.
- Un bridge local para la comunicación con el ESP32.
- `monitor.py`.
- La transferencia automática de MP3 a la microSD del DFPlayer Mini.
- Una arquitectura de microservicios.
- Infraestructura cloud compleja.
- Los antiguos ocho gestos obligatorios.
- El diseño de hardware nuevo para automatizar la carga de la microSD en esta fase.

## 24. Decisiones de diseño pendientes

Las siguientes decisiones permanecen abiertas y pueden resolverse en fases posteriores sin bloquear la arquitectura actual de MITTEN V2:

1. **Procedimiento exacto de preparación de la microSD:** pasos que debe seguir el usuario para copiar, actualizar y verificar los MP3 generados por el backend.

2. **Método exacto para registrar o verificar el estado `audio preparado`:** mecanismo mediante el cual la aplicación registra que la pista correspondiente fue colocada correctamente en la microSD.

3. **Algoritmo de reconocimiento definitivo:** el algoritmo de MITTEN V1 se utiliza como baseline inicial. Futuras alternativas podrán evaluarse mediante pruebas reproducibles sin cambiar los contratos actuales.

4. **Tuning físico de captura y reconocimiento:** ajustes derivados de pruebas con el hardware real, siempre que cualquier cambio que afecte contratos sea documentado y versionado cuando corresponda.

No vuelven a considerarse decisiones pendientes:

- firmware en MicroPython;
- backend con Node.js, Express, TypeScript y SQLite;
- frontend con React, Vite y TypeScript;
- Web Serial como único propietario del puerto serie;
- eliminación de `monitor.py` y del bridge local;
- estructura general del repositorio;
- Protocol Version 2;
- `maxMessageBytes = 8192`;
- timeouts de Protocol Version 2;
- handshake y correlación mediante `id` y `syncId`;
- estados oficiales del dispositivo;
- evento `recognition.detected`;
- formato `GestureData`;
- calibración MPU como estado/configuración local del dispositivo;
- sincronización transaccional por reemplazo completo;
- un único perfil activo;
- política de edición de gestos;
- `gesture.id` inmutable;
- `audioTrack` 1–50, first-fit, independiente de `gesture.id`, inmutable mientras exista el gesto y reutilizable después de eliminarlo;
- convención DFPlayer `/mp3/{audioTrack:04d}.mp3`;
- generación o preparación de MP3 desde `apps/api`;
- reproducción autónoma mediante DFPlayer Mini;
- datos de gestos V1 no migrados a V2;
- `mittenv1/` como repositorio histórico independiente;
- sincronización y persistencia atómica documentadas en `docs/synchronization.md`.

## 25. Criterios de aceptación generales

MITTEN V2 podrá considerarse funcional cuando, como mínimo, se verifique que:

- **CA-001:** Un usuario puede registrarse e iniciar sesión.
- **CA-002:** Un usuario autenticado sólo puede acceder a su propia biblioteca de gestos.
- **CA-003:** El usuario puede conectar MITTEN mediante Web Serial.
- **CA-004:** La interfaz sólo muestra el dispositivo como conectado después de confirmar comunicación con el ESP32.
- **CA-005:** El usuario puede solicitar y completar la grabación de un gesto real.
- **CA-006:** Los datos recibidos desde el ESP32 son validados antes de guardarse.
- **CA-007:** El gesto queda asociado al usuario autenticado.
- **CA-008:** Se genera un archivo de audio asociado al gesto.
- **CA-009:** El usuario puede previsualizar el audio desde la aplicación.
- **CA-010:** El gesto y su identificador de pista pueden sincronizarse al ESP32.
- **CA-011:** La aplicación muestra el inicio, progreso y resultado real de la sincronización.
- **CA-012:** El ESP32 conserva los gestos sincronizados después de reiniciarse.
- **CA-013:** El ESP32 reconoce un gesto previamente sincronizado sin una PC conectada.
- **CA-014:** El ESP32 puede ordenar al DFPlayer Mini reproducir el audio correspondiente al gesto reconocido.
- **CA-015:** El DFPlayer Mini puede reproducir por el parlante una pista correctamente preparada en la microSD.
- **CA-016:** Una desconexión durante una operación no deja bloqueada la aplicación.
- **CA-017:** Los timeouts, errores del firmware y respuestas inválidas se muestran claramente al usuario.
- **CA-018:** Después de una desconexión recuperable, el usuario puede volver a conectar MITTEN.
- **CA-019:** Dos componentes del frontend nunca compiten por abrir independientemente el mismo puerto serie.
- **CA-020:** El funcionamiento autónomo no requiere backend, navegador ni PC una vez configurados los gestos y preparada la microSD.
- **CA-021:** Las funciones principales del backend, la interpretación del protocolo, los estados de conexión y los errores pueden probarse sin hardware real.
- **CA-022:** El handshake identifica correctamente a MITTEN y obtiene la versión del firmware.
- **CA-023:** El handshake obtiene la versión del protocolo y la capacidad máxima de gestos del dispositivo.
- **CA-024:** Un dispositivo o protocolo incompatible es rechazado claramente con mensaje informativo al usuario.
- **CA-025:** El ESP32 mantiene un único perfil activo; sincronizar otro perfil reemplaza el anterior.
- **CA-026:** Eliminar un gesto del backend y sincronizar provoca su eliminación en el ESP32.
- **CA-027:** Una sincronización exitosa deja exactamente la biblioteca esperada (reemplazo completo).
- **CA-028:** Una sincronización fallida no destruye silenciosamente la última biblioteca válida del ESP32.
- **CA-029:** No pueden sincronizarse más gestos que la capacidad declarada por el ESP32 durante el handshake.
- **CA-030:** El límite inicial es de 50 gestos por usuario/perfil activo.
- **CA-031:** Los nombres o frases de los gestos respetan el máximo de 60 puntos de código Unicode.
- **CA-032:** Cada gesto tiene una identidad técnica independiente del texto visible.
- **CA-033:** Cada gesto sincronizado puede asociarse inequívocamente a una pista DFPlayer.
- **CA-034:** La interfaz distingue entre los estados: guardado, sincronizado y audio preparado.
- **CA-035:** `gesture.id` y `audioTrack` son independientes; el funcionamiento no depende de que tengan el mismo valor.
- **CA-036:** Editar `name` o `data` de un gesto no modifica su `gesture.id` ni su `audioTrack`.
- **CA-037:** Eliminar un gesto libera su `audioTrack`, que puede reutilizarse posteriormente mediante first-fit.
- **CA-038:** Un mensaje de Protocol Version 2 que supere `8192` bytes es rechazado según las reglas de `MESSAGE_TOO_LARGE`.
- **CA-039:** Durante `ERROR`, `device.status` continúa disponible y las operaciones funcionales son rechazadas con `INVALID_STATE`.
- **CA-040:** Después de reiniciar desde `ERROR`, el ESP32 comienza nuevamente en `INITIALIZING`.
