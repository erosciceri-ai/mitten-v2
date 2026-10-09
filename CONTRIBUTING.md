# Contribuir a MITTEN V2

Gracias por tu interés en MITTEN. Este repositorio corresponde a un prototipo educativo de tecnología asistiva.

## Antes de comenzar

- Lee [la guía de desarrollo](docs/development.md) y los documentos canónicos de [docs/README.md](docs/README.md).
- Abre un issue para cambios de protocolo, arquitectura o comportamiento observable.
- No incluyas secretos, archivos `.env`, bases SQLite, MP3 generados ni perfiles locales del firmware.

## Flujo recomendado

1. Crea una rama desde `main`.
2. Realiza un cambio pequeño y enfocado.
3. Añade o actualiza pruebas cuando cambie el comportamiento.
4. Ejecuta las validaciones indicadas en `docs/development.md`.
5. Abre un pull request explicando el problema, la solución y las pruebas realizadas.

Los cambios del protocolo serie requieren actualizar `docs/protocol.md`, los contratos compartidos y la versión de protocolo cuando corresponda.
