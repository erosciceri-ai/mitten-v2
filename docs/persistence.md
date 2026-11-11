# Persistencia de MITTEN V2 · Fase 3

SQLite sigue siendo el proveedor predeterminado para desarrollo local. PostgreSQL se selecciona con `DB_PROVIDER=postgres`. Ambos ejecutan las mismas operaciones de repositorio y conservan el contrato HTTP. Los MP3 siguen en `AUDIO_DIR`. Mantener la API fuera de acceso público mientras el directorio de audio dependa de almacenamiento efímero.

## Configuración y esquema

| Variable | Valor y alcance |
| --- | --- |
| `DB_PROVIDER` | `sqlite` (predeterminado) o `postgres`. |
| `DB_PATH` | Ruta de SQLite. Las pruebas normales usan `:memory:`. |
| `DATABASE_URL` | URL `postgresql://` con host, base y credenciales inyectadas por el entorno. Las opciones de conexión se configuran fuera de la URL. |
| `DB_TLS` | `verify-full` por defecto. `disable` solo admite loopback fuera de producción. Para una CA privada, establecer `NODE_EXTRA_CA_CERTS` antes de arrancar Node. |
| `DB_POOL_MAX` | 5 conexiones por proceso por defecto, configurable de 1 a 20. Reservar capacidad para administración y sumar el presupuesto de todas las instancias. |

Usar una base UTF-8 dedicada y un rol de aplicación ajeno a superusuarios. El esquema usa las tablas `users`, `gestures`, `profiles`, `audio_tracks`, `sync_sessions` y `sync_gestures_staging`. Las tres tablas de perfiles y sesiones se conservan para compatibilidad de datos. `mitten_schema_migrations` registra la aplicación de SQL versionado. La primera migración mantiene claves, índices, unicidad de email y Google, y la clave foránea compuesta que impide asociar una pista a un gesto de otro usuario o con distinto número de pista.

Los timestamps conservan los valores originales y los nuevos se emiten como texto UTC en el formato de SQLite. `data` conserva el JSON serializado. `gestures.id` conserva el rango de 32 bits que exige el protocolo. Los otros identificadores numéricos se leen como enteros seguros de JavaScript. Al crear, editar o eliminar un gesto o publicar su audio, PostgreSQL bloquea la fila de usuario dentro de la transacción. SQLite usa `BEGIN IMMEDIATE`. Así, la selección de la primera pista libre y su actualización se confirman juntas.

`npm run db:migrate -w apps/api` aplica el esquema del proveedor elegido. PostgreSQL aplica las migraciones dentro de una transacción y usa un bloqueo asesor para serializar arranques concurrentes. La API también aplica migraciones al iniciar. `/api/health` indica vida del proceso. `/api/ready` consulta la base elegida y comprueba la disponibilidad de TTS. En producción las respuestas de readiness conservan el formato genérico de Fase 2.

## Respaldo y restauración

Guardar los respaldos cifrados y con acceso restringido. Contienen datos de usuarios, hashes de contraseña y metadatos privados. Usar destinos nuevos para cada restauración y probar registro, login, lectura de gestos y conteos antes de cambiar configuración.

### SQLite

Con la CLI de SQLite, crear una copia consistente del archivo activo con su API de backup. Incluye las transacciones confirmadas en WAL al momento del respaldo. Verificar integridad y claves foráneas sobre la copia. Conservarla como archivo separado y protegerla de escrituras.

```text
sqlite3 /ruta/mitten.db ".backup '/respaldos/mitten.sqlite'"
sqlite3 -readonly /respaldos/mitten.sqlite "PRAGMA integrity_check; PRAGMA foreign_key_check;"
sqlite3 /restauracion/mitten.db ".restore '/respaldos/mitten.sqlite'"
sqlite3 -readonly /restauracion/mitten.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"
```

Esperar `ok` y cero filas de claves foráneas. Probar el archivo restaurado con `DB_PROVIDER=sqlite` y `DB_PATH` apuntando a la nueva ruta. Para preservar audio en un corte, detener las escrituras de la aplicación y respaldar `AUDIO_DIR` junto con la base. La copia del archivo principal con SQLite activo puede omitir datos del WAL. [SQLite Online Backup API](https://www.sqlite.org/backup.html)

### PostgreSQL

Configurar servicios libpq `mitten_source` y `mitten_restore` con `sslmode=verify-full`, su CA y un passfile privado. Usar herramientas cliente de la misma versión mayor del servidor. El destino debe ser una base vacía creada para restauración con permisos adecuados.

```text
pg_dump --no-password --format=custom --file=mitten.dump --dbname=service=mitten_source
pg_restore --list mitten.dump
pg_restore --no-password --single-transaction --no-owner --no-privileges --dbname=service=mitten_restore mitten.dump
```

Verificar las seis tablas, el historial de migraciones, las asociaciones, los conteos y el próximo ID de cada secuencia en la base restaurada. Volver a otorgar los permisos requeridos al rol de aplicación y probar el arranque aislado. [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html) · [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html)

## Ensayo de importación y corte

1. Crear un respaldo SQLite consistente con `PRAGMA user_version=2`. Si el origen es anterior, actualizar primero una copia aislada con las migraciones de SQLite y generar el respaldo desde esa copia.
2. Preparar PostgreSQL en una base dedicada y vacía, establecer `DB_PROVIDER=postgres`, y ejecutar `npm run db:migrate -w apps/api`.
3. Ejecutar `npm run db:import-sqlite -w apps/api -- /ruta/mitten.sqlite`. El modo predeterminado abre SQLite en solo lectura, comprueba integridad y asignaciones, inserta y compara todas las filas en una transacción PostgreSQL, ajusta y verifica los próximos IDs, y revierte la transacción. Los próximos IDs tienen en cuenta los IDs borrados registrados en `sqlite_sequence`. El reporte contiene conteos e IDs de secuencia.
4. Para un corte autorizado, bloquear escrituras y generación de audio, tomar un respaldo final de SQLite y conservar la copia de audio coherente con ese punto. Repetir el ensayo contra el destino vacío y, después de revisar el reporte, pasar explícitamente `--apply` al mismo comando. La herramienta exige tablas de aplicación vacías y secuencias sin usar. Usa bloqueos exclusivos durante el ensayo y la importación, así que ejecutarla con el destino fuera de servicio.
5. Antes de habilitar escrituras, verificar conteos, login, aislamiento, descarga de audio desde la misma ubicación esperada y readiness. Mantener el SQLite de origen y su respaldo sin escrituras. Los metadatos de audio mantienen sus rutas originales. Si `AUDIO_DIR` se mueve, la aplicación exigirá que el archivo corresponda a la ruta canónica del usuario antes de servirlo.

### Reversión

Antes de habilitar escrituras en PostgreSQL, detener la API y volver a la configuración SQLite y al SHA aprobado, con el origen congelado o su respaldo coherente y la misma versión de audio. Después de habilitar escrituras, congelar PostgreSQL, tomar su respaldo y reconciliar las altas, cambios y bajas posteriores al corte antes de volver a SQLite. La herramienta cubre SQLite a PostgreSQL. Mantener PostgreSQL como fuente de verdad hasta completar esa reconciliación y validarla en un entorno aislado. Ante un fallo de restauración, conservar las bases originales y repetir sobre un destino nuevo.

El importador carga una tabla a la vez en memoria. Medir tamaño, tiempos y uso de espacio con una copia antes de planificar el corte. Los valores incompatibles con PostgreSQL, como texto con bytes NUL o enteros fuera del rango seguro, hacen fallar la importación y se conserva el destino previo.

## Verificación local

Las pruebas SQLite de siempre se ejecutan con `npm test -w apps/api`. Para PostgreSQL, establecer `MITTEN_TEST_POSTGRES_URL` con una URL de administración de una instancia de prueba dedicada en loopback y un rol capaz de crear bases. El suite crea y retira bases con nombres aleatorios. Establecer `MITTEN_TEST_PG_BIN` al directorio con `pg_dump` y `pg_restore` para habilitar la prueba de respaldo y restauración.

```text
npm test -w apps/api -- src/db/postgres.integration.test.ts
```

## Fase 4 · Audio persistente

Introducir una interfaz de almacenamiento privado con operaciones para guardar un MP3, abrir un stream con rango opcional, consultar metadatos y eliminar un objeto. Usar claves por usuario, gesto y generación, con una referencia opaca en la base. Guardar el objeto primero y actualizar la referencia mediante una transacción que verifique que el gesto sigue vigente. Hacer los reintentos idempotentes y limpiar objetos huérfanos o reemplazados de forma diferida.

La autorización de lectura y exportación sigue en la API. Mantener `audioTrack` y la salida `/mp3/0001.mp3` para el ZIP de microSD. Definir migración y verificación de los MP3 existentes por tamaño y checksum, tratamiento de archivos faltantes, política de eliminación, respaldo y restauración coordinados con PostgreSQL. Validar descargas, rangos HTTP y exportación ZIP después de reiniciar el proceso y desde otra instancia antes de aprobar acceso público.
