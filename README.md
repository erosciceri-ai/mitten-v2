# MITTEN V2

Guante electrónico wearable que traduce gestos de mano a audio hablado.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Una vez configurado y sincronizado, MITTEN puede reconocer gestos y reproducir el audio asociado sin depender de la PC, el navegador, el frontend ni el backend.

La aplicación web se comunica directamente con el ESP32 mediante Web Serial API usando el protocolo serie MITTEN V2.

- 5 sensores flex para medir la flexión de los dedos
- MPU6050 para orientación y movimiento de la mano
- ESP32 con MicroPython como firmware
- DFPlayer Mini para reproducción autónoma de MP3 desde microSD
- Aplicación web (React + Vite + TypeScript)
- API backend (Node.js + Express + TypeScript + SQLite), responsable también de preparar/generar el audio

## Estructura del repositorio

```text
mitten/
├── .github/             # CI y actualizaciones automatizadas
├── apps/
│   ├── web/           # React + Vite + TypeScript
│   └── api/           # Node.js + Express + TypeScript + SQLite
├── firmware/
│   └── esp32/         # MicroPython
├── packages/
│   └── contracts/      # Implementación compartida de tipos, contratos y validaciones
├── tools/
│   └── esp32-simulator/  # Simulador ESP32 (stdin/stdout NDJSON)
├── docs/
│   ├── requirements.md
│   ├── architecture.md
│   ├── protocol.md
│   ├── gesture-format.md
│   ├── synchronization.md
│   ├── development.md
│   ├── legacy/          # Documentación histórica de MITTEN V1
│   └── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
├── AGENTS.md
└── README.md
```

## Estado de la demostración

MITTEN V2.1 puede demostrarse por software sin el guante físico:

- La portada pública explica el objetivo, alcance, hardware, software y recorrido del gesto.
- La aplicación permite registro, autenticación, biblioteca de gestos, captura y sincronización.
- La suite integral recorre registro, captura simulada, persistencia, sincronización, reinicio,
  reconocimiento y la trama UART destinada al DFPlayer.

El simulador oficial usa NDJSON por `stdin/stdout`. No se conecta directamente a la interfaz web
ni reemplaza Web Serial. La demostración conceptual de la portada tampoco mide precisión real.

## Primeros pasos

### Requisitos

- Node.js >= 20.17.0
- npm
- Python 3 con `pytest`, para las pruebas del firmware

### Instalación

```bash
npm ci
```

### Configuración local

Copiá los ejemplos antes de iniciar los servicios:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

En Linux o macOS:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Generá un `JWT_SECRET` local de al menos 32 caracteres y guardalo sólo en `apps/api/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Los archivos `.env` reales están ignorados por Git. La dirección pública de contacto se documenta
en `apps/web/.env.example`; las credenciales y claves externas nunca deben commitearse.

### Iniciar la aplicación

Iniciá API y web desde una sola terminal. El comando espera el readiness de la API antes de abrir
la web y cierra ambos procesos al terminar:

```bash
npm run dev
```

Para verla desde un celular conectado al mismo Wi-Fi:

```bash
npm run dev --workspace=apps/web -- --host 0.0.0.0
```

La API debe permanecer en la PC. El acceso por IP local sirve para revisar la interfaz; Web Serial
puede requerir HTTPS fuera de `localhost`.

### Comandos

```bash
npm test          # Contratos, API, web y simulador
npm run build     # Compilar todos los workspaces
python -B -m pytest firmware/esp32/tests -q -p no:cacheprovider
npm run simulator # Iniciar el simulador CLI después de compilar
npm run test:e2e   # Recorrido completo de navegador con simulador y MP3 fixture
```

## Integraciones opcionales

- **Google:** el botón sólo aparece cuando el mismo Client ID se configura como
  `VITE_GOOGLE_CLIENT_ID` en la web y `GOOGLE_CLIENT_ID` en la API. Ver
  `docs/google-authentication.md`.
- **Audio:** `TTS_PROVIDER=mock` devuelve un estado explícito de audio no disponible y nunca fabrica
  un MP3. Para voz argentina local, ejecutá `npm run tts:setup`; consulta
  [`docs/demo-software-mp3.md`](docs/demo-software-mp3.md). ElevenLabs sigue disponible como
  adaptador opcional.
- **Hardware:** el recorrido físico debe validarse en el ESP32, sensores, MPU6050, DFPlayer Mini,
  microSD y parlante reales antes de afirmar que el prototipo completo está certificado.

## Privacidad y datos locales

SQLite, MP3 generados, perfiles del firmware, tokens, claves y archivos `.env` quedan fuera del
repositorio. La cuenta puede exportar sus datos públicos desde la aplicación; el formulario de
contacto permite abrir un borrador en Gmail o en la aplicación de correo del visitante.
MITTEN no envía ni almacena el mensaje; el visitante lo revisa y envía desde su correo.

## Documentación

Consulta `docs/README.md` para la jerarquía documental.
Documentos principales:
- `docs/protocol.md`: protocolo serie V2.
- `docs/gesture-format.md`: formato canónico de los datos de gestos.
- `docs/synchronization.md`: sincronización transaccional y persistencia atómica.
- `docs/requirements.md`: requisitos funcionales y criterios de aceptación.
- `docs/architecture.md`: arquitectura general del sistema.
- `docs/software-validation.md`: alcance y evidencia de la validación sin hardware.
- `docs/google-authentication.md`: configuración y límites de Google Identity Services.
- `docs/development.md`: preparación, ejecución local y validaciones para contribuir.

Las contribuciones se describen en `CONTRIBUTING.md` y los reportes de seguridad en `SECURITY.md`.

## Licencia

[MIT](LICENSE) © 2026 Eros Ciceri
