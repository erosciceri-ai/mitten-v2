# Despliegue de MITTEN V2

La aplicación completa se compila desde la raíz del monorepo con Node.js 24.16.0, fijado en `.nvmrc`, y el `package-lock.json` del mismo commit:

```sh
npm ci
npm run build
```

El build genera la web en `apps/web/dist`, la API en `apps/api/dist` y los contratos compartidos en `packages/contracts/dist`. La API compilada se ejecuta con `npm start --workspace=apps/api` desde un checkout con las dependencias instaladas. El build no abre SQLite.

## Flujo con GitHub

1. Abrir un PR contra `main` y verificar el job `CI / validate`. El job instala con `npm ci`, ejecuta pruebas, compila y adjunta `mitten-build-<SHA>` al run exitoso.
2. Para el despliegue, seleccionar el SHA aprobado de `main`. En el host Linux, usar un checkout de ese SHA e instalar con `npm ci` para obtener el módulo nativo de SQLite para ese host. Usar los directorios compilados del artefacto o recompilar desde ese checkout si cambia la configuración pública de Vite. Conservar el checkout para que funcionen los enlaces entre workspaces y esté disponible el helper de Piper.
3. Servir `apps/web/dist` bajo HTTPS con un proxy inverso delante de Express. Pasar `/api/*` a Express conservando el prefijo. Servir los archivos estáticos por su ruta y usar `index.html` como fallback de las rutas de React Router, incluidas `/login`, `/register` y `/gestures`. La web usa `/api` en el mismo origen por defecto.
4. Ejecutar una sola instancia de la API con `NODE_ENV=production`, `HOST=127.0.0.1` si el proxy comparte el host, `FRONTEND_URL` con el origen HTTPS, `JWT_SECRET` estable y `DB_PATH` y `AUDIO_DIR` absolutos sobre almacenamiento persistente. Mantener los secretos fuera de GitHub Artifacts y de las variables `VITE_*`, que son públicas. Configurar también `TRUSTED_PROXY` con el peer del proxy y verificar `/api/ready` desde la red operacional antes de abrir tráfico.
5. Configurar un proveedor real de TTS. Para Piper, instalar el runtime y el modelo con su metadata y fijar `PIPER_EXECUTABLE` y `PIPER_MODEL`. Para ElevenLabs, usar sus variables del servidor. Si se habilita Google, configurar el origen HTTPS autorizado y usar el mismo Client ID en el build de la web y en la API. Definir el canal de contacto público con `VITE_CONTACT_EMAIL`.

Antes de poner datos reales, respaldar SQLite y los MP3 y comprobar una restauración en un entorno aislado. La API aplica las migraciones existentes durante el arranque. Aprobar el manejo de los datos y validar el arranque en staging con datos de prueba antes de apuntar la API a una base existente. Conservar el SHA anterior y un respaldo coherente con el esquema previo para una eventual reversión.

La aceptación de Fase 2 debe cubrir registro, sesión, biblioteca, persistencia después de reiniciar, generación de un MP3 real y exportación para microSD. Probar también captura y sincronización por Web Serial desde la URL HTTPS con un navegador compatible y el ESP32 real.

## Configuración de Fase 2

El [ejemplo de nginx](deployment/mitten.nginx.conf) sirve React Router y reenvía `/api/` desde el mismo origen. Incluí el archivo estándar `mime.types` en el bloque `http`. Sustituí dominio, directorio y certificados. Comprobá la configuración con `nginx -t` en el host. El proxy debe redirigir HTTP a HTTPS, reemplazar las cabeceras reenviadas del cliente y bloquear acceso directo desde Internet a Express. Con un CDN delante de nginx, primero configurá la identificación del cliente en el proxy con los rangos oficiales del CDN.

| Variable | Configuración |
| --- | --- |
| `NODE_ENV`, `HOST`, `PORT` | `production`; `127.0.0.1` y `3000` para el nginx de ejemplo. En un host gestionado, usar el bind y puerto que exija la plataforma, con el puerto de Express accesible únicamente por su ingreso autorizado. |
| `FRONTEND_URL` | Origen HTTPS exacto de la web, sin ruta ni barra final. `CORS_ORIGIN` sigue disponible como alias. El API autoriza cada recurso con JWT y permite clientes sin cabecera Origin. |
| `TRUSTED_PROXY` | IP o CIDR de cada salto de confianza, separados por comas. Ejemplo local `127.0.0.1`. Vacío ignora cabeceras reenviadas. Verificá que solicitudes con cabeceras de cliente arbitrarias mantienen la IP real y que una solicitud TLS válida llega con protocolo HTTPS. |
| `JWT_SECRET` | Secreto aleatorio estable de al menos 32 caracteres, generado con al menos 32 bytes de entropía y administrado fuera del repositorio. Conservá la clave legítima existente para preservar sus sesiones. Cambiarla invalida los tokens activos. |
| `JWT_EXPIRES_IN` | Por defecto `7d`. Acepta 60 segundos a 30 días, con unidades `s`, `m`, `h`, `d`, `w` o segundos enteros. Afecta solo nuevas emisiones. |
| `DB_PATH`, `AUDIO_DIR` | Rutas absolutas y escribibles sobre un volumen persistente. Respaldar la base de datos y los MP3 como conjunto. |
| `TTS_PROVIDER` | `piper` con `PIPER_EXECUTABLE`, `PIPER_MODEL` y `PIPER_TIMEOUT_MS` opcional, o `elevenlabs` con `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID`. Si se aumenta el timeout de Piper, ajustar también el timeout del proxy. |
| `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID` | Opcionales. Usar el mismo Client ID web y registrar el origen HTTPS de la web en Google. |
| `VITE_API_URL`, `VITE_CONTACT_EMAIL` | Opcionales y públicos en el build. Mantener `/api` en el mismo origen para el ejemplo. Si la API tiene otro origen, usar su URL HTTPS terminada en `/api` y permitir su origen exacto en `connect-src`. |

`/api/health` devuelve únicamente el estado del proceso. `/api/ready` comprueba el proveedor de base seleccionado y la configuración de TTS. En producción devuelve `503` cuando la base falla o TTS está degradado, con un estado genérico. El ejemplo de nginx limita readiness a loopback. Para el chequeo periódico de vida de un proveedor gestionado usar `/api/health` y consultar readiness aparte. La disponibilidad de TTS en readiness comprueba configuración local y puede requerir una síntesis de prueba para verificar el proveedor de punta a punta.

El frontend conserva el Bearer en `localStorage` y reintenta la validación de sesión ante fallos temporales. El cierre de sesión borra la copia local. Como evolución opcional, evaluar una sesión revocable con cookie `HttpOnly; Secure; SameSite` y controles CSRF. Esa migración requiere decidir topología de orígenes, estrategia de revocación y transición para sesiones activas. La CSP de ejemplo permite el script y el iframe oficiales de Google Identity Services, audio con URL `blob:` y estilos en línea usados por React. Confirmar Google y Web Serial en el origen HTTPS elegido.

### Límites por proceso

| Superficie | Límite |
| --- | --- |
| API | 900 solicitudes por minuto por IP, con IPv6 agrupado por subred |
| Registro | 12 intentos por hora por IP; JSON de 4 KiB |
| Login con contraseña | 60 intentos por IP y 20 por correo normalizado cada 15 minutos; JSON de 4 KiB |
| Google | 30 intentos por IP cada 15 minutos para login y vinculación en conjunto; JSON de 8 KiB |
| Autenticación | 180 solicitudes por minuto en la instancia y hasta 8 verificaciones o altas costosas en paralelo |
| Gestos | 180 solicitudes por minuto por cuenta; JSON de 32 KiB en altas y ediciones, más el límite serial existente |
| TTS | 10 solicitudes por minuto por cuenta y 60 por IP; dos trabajos simultáneos por instancia; JSON de hasta 1 KiB cuando se envía; MP3 nuevo de hasta 1 MiB |
| Exportaciones | 10 exportaciones de cuenta y 5 ZIP por minuto por cuenta; dos ZIP simultáneos por instancia y hasta 24 MiB de audio de entrada por archivo |

Las cuotas en memoria se reinician con el proceso y cada instancia lleva su propia cuenta. Las redes escolares con NAT comparten cuota por IP. Si se necesitan varias instancias o una cuota persistente, hace falta un limitador compartido o controles del ingreso. El correo como clave de login también permite que terceros agoten temporalmente la cuota de una cuenta. El registro existente devuelve `409` para correos ya registrados y revela su existencia.

### Persistencia de Fase 3

Consultar el [procedimiento de PostgreSQL](persistence.md) para configurar el proveedor, respaldar, restaurar y ensayar la importación desde SQLite. Mantener la API fuera de acceso público mientras los MP3 dependan de almacenamiento efímero.

### Cloudflare Pages, Render y Neon

Consultar la [guía de Fases 5A y 5B](deployment/phase5.md) para el despliegue gestionado y su validación.
