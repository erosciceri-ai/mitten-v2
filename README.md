# MITTEN V2

Guante electrónico wearable que traduce gestos de mano a audio hablado.

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
│   └── README.md
├── AGENTS.md
└── README.md
```

## Primeros pasos

### Requisitos

- Node.js >= 18
- npm

### Instalación

```bash
npm install
```

### Comandos

```bash
npm run build    # Compilar todos los workspaces
npm test         # Ejecutar tests en todos los workspaces
npm run simulator  # Iniciar el simulador ESP32
```

## Documentación

Consulta `docs/README.md` para la jerarquía documental.
Documentos principales:
- `docs/protocol.md`: protocolo serie V2.
- `docs/gesture-format.md`: formato canónico de los datos de gestos.
- `docs/synchronization.md`: sincronización transaccional y persistencia atómica.
- `docs/requirements.md`: requisitos funcionales y criterios de aceptación.
- `docs/architecture.md`: arquitectura general del sistema.

## Licencia

MIT
