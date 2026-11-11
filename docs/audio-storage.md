# Persistencia de MP3

La API usa `AudioStorage` para generar, reproducir y exportar audio. El proveedor se selecciona para las **nuevas** versiones. Cada objeto conserva en la base su propio proveedor, por lo que la API puede leer ambos durante una transición. Los MP3 de Fase 3 aún se leen desde la ruta local esperada del propietario y la pista.

## Configuración

| Variable | Valor |
|---|---|
| `AUDIO_STORAGE_PROVIDER` | `local` por defecto o `s3` |
| `AUDIO_DIR` | Raíz local y de los MP3 legacy. Debe estar en un volumen persistente si se usa `local` fuera de desarrollo. |
| `AUDIO_S3_ENDPOINT` | Endpoint de la rama del bucket. HTTPS salvo pruebas/desarrollo en loopback. |
| `AUDIO_S3_REGION` | Región usada para la firma S3, según el endpoint. |
| `AUDIO_S3_BUCKET` | Nombre del bucket privado, ya provisionado. |
| `AUDIO_S3_ACCESS_KEY_ID`, `AUDIO_S3_SECRET_ACCESS_KEY` | Credenciales de servicio inyectadas en el backend. |

En Neon, la visibilidad se configura en la consola o API de Neon. Configurar `private` y verificar que un GET directo sin credenciales sea denegado. El cliente AWS firma solicitudes con `forcePathStyle: true` y usa `PutObject`, `GetObject` y `DeleteObject`. No usa ACL, URLs prefirmadas, multipart ni checksums específicos del proveedor. El SDK envía sus checksums opcionales solo cuando la operación los exige. La API compara SHA-256 de los bytes descargados con su metadata relacional. Se verificó el flujo contra un S3 compatible local. Falta el ensayo contra un bucket Neon autorizado. [Autenticación](https://github.com/neondatabase/website/blob/main/content/docs/storage/authentication.md), [visibilidad](https://neon.com/blog/building-neon-object-storage).

## Integridad y rutas

SQLite v3 y PostgreSQL 002 incorporan `audio_objects`, el puntero de la pista y una revisión de audio. Una generación reserva un objeto `pending` con UUID, propietario, gesto, proveedor, tamaño, MIME y SHA-256. Luego escribe y relee hasta 1 MiB, valida los bytes y publica el puntero en una transacción corta bajo el bloqueo de usuario. La revisión, el nombre y la pista evitan publicar resultados de una captura anterior del estado. Una regeneración conserva la versión anterior hasta el commit. Un cambio de nombre invalida el puntero y un borrado libera la pista. Los objetos desplazados quedan `retired`. Las copias locales originales migradas quedan `archived` fuera de la limpieza automática.

Si la respuesta de PUT o COMMIT se pierde, la API conserva el registro de la operación. Un fallo anterior al commit deja el audio previo disponible y un objeto `pending` para reconciliar. Un commit que sí llegó deja una versión `active` que el recolector respeta. Las peticiones concurrentes con distinta identidad y la misma revisión tienen un único ganador. El POST de generación admite el encabezado opcional `Idempotency-Key`, con 1–128 caracteres ASCII alfanuméricos, guión o guión bajo. La confirmación se registra por usuario y gesto en el mismo commit y una repetición devuelve la respuesta exitosa por 24 horas, aun si el gesto fue renombrado después. El cliente puede usar una clave nueva para una regeneración deliberada.

Las rutas y formatos HTTP de la aplicación se conservan. El MP3 autenticado mantiene `Cache-Control: private, no-store`, acepta rangos de un tramo con respuesta 206 y devuelve 416 cuando el rango no se satisface. Para validar el SHA-256 también en una lectura parcial, el backend relee el MP3 completo y entrega solo el rango solicitado. El ZIP conserva el manifiesto v1 y las entradas `mp3/0001.mp3` a `mp3/0050.mp3`.

## Inventario, migración y limpieza

Ejecutar con configuración explícita de una copia, conservando la ruta legacy válida para el sistema de origen. No publicar el inventario porque contiene identificadores y rutas locales.

```bash
npm run audio:maintenance --workspace=@mitten/api
npm run audio:maintenance --workspace=@mitten/api -- --apply
npm run audio:maintenance --workspace=@mitten/api -- --collect
npm run audio:maintenance --workspace=@mitten/api -- --collect --apply
```

1. El primer comando abre SQLite de solo lectura o PostgreSQL en una transacción de solo lectura. Compara el propietario, gesto, pista y ruta esperada. Revisa los MP3 legacy referenciados y reporta los MP3 sueltos que encuentra en la raíz y en las carpetas esperadas por usuario. Reporta tamaño y SHA-256 para los audios verificables.
2. Aplicar solo con una copia de seguridad y un destino privado revisado. El comando puede aplicar la migración de esquema al abrir la base. Cada archivo se confirma por separado, preserva `generatedAt` y deja el original en disco. Repetir el mismo comando verifica los objetos ya migrados y reintenta las referencias pendientes. Revisar resultados `missing-or-invalid` y `verify-or-retry` antes del corte.
3. La vista previa de limpieza selecciona hasta 100 objetos con más de 24 horas de gracia. La aplicación reclama solo `pending`, `retired` o `deleting` sin un puntero. Un error deja el objeto en `deleting` para repetir el borrado. Los archivos legacy y los objetos archivados quedan fuera de esta operación. Ejecutar manualmente después de revisar backups. Una pérdida completa de la base puede dejar claves sin registro: contrastar el inventario del bucket con el backup antes de considerar su eliminación.

## Copia de seguridad y rollback

Suspender escrituras y limpieza mientras se toma una copia coordinada. Respaldar la base, los archivos legacy/locales y el conjunto de objetos por clave junto con sus metadatos SHA-256. Guardar la asociación entre el backup, endpoint, bucket y fecha. Una restauración de PostgreSQL mediante `pg_restore` no restaura el contenido de Object Storage.

Restaurar primero los archivos y objetos a destinos aislados conservando sus claves, luego la base correspondiente. Ejecutar el inventario y verificar por API reproducción, Range y ZIP de usuarios de prueba antes de reabrir escrituras. Mantener la limpieza suspendida hasta que el respaldo esté verificado. El importador SQLite de Fase 3 admite snapshots v2 y v3 sin objetos versionados. Para un snapshot v3 con objetos versionados, usar una copia coordinada que conserve las referencias.

Para dejar de crear versiones S3, cambiar el proveedor a `local` y conservar el acceso al bucket para las referencias ya publicadas. Para regresar al binario de Fase 3, restaurar el snapshot de base anterior a las migraciones y sus MP3 originales. Esto vuelve al punto de corte y requiere tratar por separado las operaciones posteriores. No ejecutar el binario previo sobre el esquema v3/002.

## TTS y Fase 5

Render Free documenta 0,1 CPU, 512 MB de RAM y disco efímero. También suspende por inactividad y asigna 750 horas gratuitas por workspace y mes. El almacenamiento S3 resuelve la persistencia de los MP3, mientras que Piper sigue requiriendo un ensayo del proceso Python y Node juntos en Linux con esos límites. Medir arranque frío, latencia p50/p95 y máximo de RAM del contenedor para una y dos síntesis concurrentes. Confirmar decodificación de los MP3, timeouts y comportamiento bajo presión de CPU. [Planes de cómputo](https://render.com/docs/compute-plans), [límites Free](https://render.com/docs/free).

Si Render Free no alcanza, una máquina propia con Linux permite mantener Piper sin contratar un servicio nuevo. OCI Always Free documenta 1.500 OCPU-h y 9.000 GB-h de memoria mensuales en Ampere A1, equivalentes a 2 OCPU y 12 GB continuos para una cuenta Always Free, sujeto a capacidad y arquitectura ARM. El CPU Basic de Hugging Face publica 2 vCPU, 16 GB y disco efímero, pero los Spaces Docker o Gradio requieren un plan pago. [OCI Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Hugging Face Spaces](https://huggingface.co/docs/hub/main/en/spaces-overview).

Antes de la publicación quedan por verificar el bucket privado de Neon, la restauración coordinada con el proveedor elegido, los límites y costos de salida, el rendimiento real de Piper en Linux y la política de limpieza acorde al período de backups.

### Ensayo local de Fase 4

SeaweedFS 4.53 en loopback rechazó GET anónimo con 403 y aceptó las operaciones firmadas. La suite de integración pasó con SQLite y PostgreSQL. Una lectura tras reiniciar el servicio S3 conservó los 515 bytes y su SHA-256. La migración por CLI verificó un MP3 real de Piper de 32.182 bytes. El dry-run conservó el hash de la base, la segunda aplicación lo reconoció como ya migrado y el original, la API y el ZIP conservaron el mismo SHA-256.

En Windows, Piper 1.8.0 con la voz Daniela High en un host de 16 procesadores lógicos tardó 4,18–4,54 s en tres ejecuciones secuenciales. Consumió 7,52–8,38 s de CPU acumulada y 246,0–246,5 MiB de RSS máximo muestreado por síntesis. Con dos ejecuciones simultáneas, cada una tardó 4,74–4,80 s, consumió 10,22–10,28 s de CPU y llegó a 246,9 MiB de RSS. Las medidas corresponden al árbol de procesos de Piper. El consumo combinado con Node y los tiempos bajo los límites de Render siguen sin medir en Linux.
