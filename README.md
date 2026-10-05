# MITTEN V2

Guante electrónico wearable que traduce gestos de mano a audio hablado.

- 5 sensores flex para medir la flexión de los dedos
- MPU6050 para orientación y movimiento de la mano
- ESP32 con MicroPython como firmware
- DFPlayer Mini para reproducción de audio autónoma
- Aplicación web (React + Vite + TypeScript)
- API backend (Node.js + Express + TypeScript + SQLite)

## Estructura del repositorio

```text
mitten/
├── apps/
│   ├── web/           # React + Vite + TypeScript
│   └── api/           # Node.js + Express + TypeScript + SQLite
├── firmware/
│   └── esp32/         # MicroPython
├── packages/
│   └── contracts/     # Tipos, esquemas, validaciones y protocolo compartido
├── tools/
│   └── esp32-simulator/  # Simulador ESP32 (stdin/stdout NDJSON)
├── docs/
│   ├── requirements.md
│   ├── architecture.md
│   ├── protocol.md
│   ├── gesture-format.md
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
npm run lint     # Lint en todos los workspaces
npm run simulator  # Iniciar el simulador ESP32
```

## Documentación

Consulta `docs/README.md` para la jerarquía de documentos canónicos.

## Licencia

MIT
