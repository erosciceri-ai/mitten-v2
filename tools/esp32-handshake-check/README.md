# esp32-handshake-check

Verifica el handshake del Protocolo Version 2 contra una ESP32 física.

## Por qué existe

La aplicación web es la única propriétaire del puerto serie en MITTEN V2 (Web
Serial). Pero hay un hueco de verificación que ninguna suite cubre: **una
imagen instalada en la placa puede fallar en el arranque sin dejar ninguna
huella observable**.

Con la imagen personalizada de MicroPython (`MICROPY_HW_ENABLE_UART_REPL=0` y
consola ESP-IDF desactivada) no hay REPL ni salida de consola. Si `main.py`
levanta una excepción antes de entrar al bucle de protocolo, la placa queda
completamente muda: ni el banner de MicroPython, ni una traza, ni un byte. La
comprobación "el guante no responde" no distingue entre un cable roto, un
firmware roto y un protocolo roto.

Esta herramienta convierte ese silencio en un resultado pass/fail en segundos,
usando exactamente el mismo request y las mismas reglas de validación que
`apps/web` y `packages/contracts`.

> Esta herramienta **no** es parte del camino de runtime. No es un bridge, no
> es un monitor y no se queda residentemente en el puerto: abre el puerto,
> envía un request, lee la respuesta y sale. El único proceso que puede
> tener el puerto abierto de forma permanente es el navegador.

## Uso

```sh
# Descubrir puertos
python mitten_handshake_check.py --list-ports

# Chequeo básico
python mitten_handshake_check.py --port COM5

# Exigir un estado concreto y pedir device.status
python mitten_handshake_check.py --port COM5 --expect-state IDLE --status

# Salida en JSON para pipes
python mitten_handshake_check.py --port COM5 --json
```

En Linux/macOS el puerto suele ser `/dev/ttyUSB0` o `/dev/ttyACM0`.

### Requisitos

`pyserial` es la única dependencia y no forma parte de los manifiestos del
proyecto:

```sh
pip install pyserial
```

## Salida

```text
OK: MITTEN handshake valid
  firmwareVersion : 2.0.0
  protocolVersion : 2
  state           : IDLE
  maxGestures     : 50
  maxMessageBytes : 8192
```

Códigos de salida:

| Código | Significado |
| --- | --- |
| 0 | Handshake válido (y estado esperado, si se pidió `--expect-state`) |
| 1 | El dispositivo respondió con algo inválido, o no respondió |
| 2 | No se pudo abrir el puerto (cable, driver, puerto ocupado) |
| 3 | Error interno inesperado |

## Interpretar un fallo

| Mensaje | Causa probable | Qué revisar |
| --- | --- | --- |
| `no handshake response within N ms` | La placa está muda | ¿La imagen correcta está instalada? ¿Los 11 módulos del firmware están en el filesystem? ¿`hardware_config.py` existe? |
| `device sent a line that is not valid JSON` | Bytes del ROM o de otro proceso mezclados | Reiniciar la placa y reintentar; revisar que nada más tenga el puerto abierto |
| `device rejected the handshake: <CODE>` | El firmware está en un estado que no permite el handshake | Ver `docs/protocol.md`; `HANDSHAKE_REQUIRED` indica que el firmware no reconoce el comando |
| `device must be "MITTEN"` | Otro programa en el puerto | Thonny u otra herramienta abierta sobre el mismo COM |
| `capabilities.maxMessageBytes must be 8192` | Firmware con otro contrato | Revisar `firmware/esp32/protocol/` |

## Pruebas

Las pruebas unitarias no necesitan hardware ni pyserial:

```sh
python -B -m unittest discover -s tools/esp32-handshake-check -v
```

## Referencias

- `docs/protocol.md` — secciones 4 (transporte), 7 (ciclo de vida) y 8 (handshake).
- `packages/contracts/src/validators.ts` — `validateHandshakeResponseResult`,
  la misma validación que aplica el frontend.
- `apps/web/src/serial/DeviceService.ts` — `performHandshake`, el cliente real.
- `firmware/esp32/MICROPYTHON_BUILD.md` — cómo se construye y se instala la
  imagen sin REPL que el firmware espera.
