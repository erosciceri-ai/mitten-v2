# esp32-firmware-sync

Inspecciona y actualiza los archivos del firmware MITTEN V2 que viven en el
filesystem de la ESP32.

## Por qué existe

La placa guarda el firmware runtime en su propio filesystem. Cuando ese
firmware falla al arrancar, la única señal observable es **silencio**: la
imagen MITTEN se compila sin REPL de UART (`MICROPY_HW_ENABLE_UART_REPL=0`) y
sin consola ESP-IDF, así que una excepción en `main.py` — por ejemplo un
módulo que nunca se copió — no deja banner, ni traza, ni un byte.

La primera pregunta útil es entonces: **¿qué hay realmente en la placa?** Esta
herramienta la responde en un comando, comparando el filesystem del board contra
el conjunto de runtime que el repositorio exige.

## Qué considera "conjunto de runtime"

El cierre transitivo de imports de `firmware/esp32/main.py`, calculado con el
mismo criterio de MicroPython (un paquete es un directorio con `__init__.py`;
`from a.b import c` importa `a.b`; los imports relativos se quedan en su
paquete). Se suman los `__init__.py` de cada paquete y el
`hardware_config.py` local de la placa.

Actualmente son **30 archivos**. Quedan fuera a propósito:

| Excluido | Motivo |
| --- | --- |
| `tests/`, `tools/`, `patches/` | No forman parte del runtime |
| `dfplayer.py` | Antecedente histórico (DFPlayer por UART); el runtime no lo importa |
| `hardware_config.example.py` | Es la plantilla, no la configuración de la placa |
| `validation/data.py` | Solo lo importan los tests; el runtime usa `validation.gesture` |
| `commands/` | Paquete vacío no importado por el runtime |

## Uso

```sh
# Ver el conjunto que se calcula desde el repositorio (no toca la placa)
python mitten_firmware_sync.py --list

# Comparar la placa contra ese conjunto
python mitten_firmware_sync.py --port COM5 --check

# Copiar los faltantes y los distintos
python mitten_firmware_sync.py --port COM5 --push --verify
```

La conexión usa `mpremote`, así que **la placa tiene que estar corriendo una
imagen con REPL**. La imagen MITTEN no lo tiene: el ciclo seguro es

```text
imagen con REPL  ->  copiar archivos  ->  imagen MITTEN (sin REPL)  ->  verificar
```

y está descrito en `firmware/esp32/MICROPYTHON_BUILD.md`.

### Opciones

| Opción | Efecto |
| --- | --- |
| `--list` | Muestra el conjunto de runtime y termina |
| `--check` | Compara la placa con el conjunto; exit 1 si falta o difiere algo |
| `--push` | Copia los faltantes y los distintos |
| `--verify` | Vuelve a comparar después de copiar |
| `--force` | También sobrescribe `hardware_config.py` |
| `--remove-extra` | Borra los archivos heredados que reporta `--check` |

`hardware_config.py` **no** se sobrescribe sin `--force`: contiene los valores
medidos de tu placa (dirección del MPU, offsets, pines) y perderlos obliga a
recalibrar.

## Salida de `--check`

```text
  OK       main.py
  FALTA    protocol/commands.py
  DISTINTO hardware.py
  EXTRA    gestos.json  (no forma parte del firmware vigente)
```

`EXTRA` no se borra salvo que se pida `--remove-extra`: puede contener datos
útiles (por ejemplo `gestos.json` con los gestos de la versión anterior).

## Pruebas

```sh
python -B -m unittest discover -s tools/esp32-firmware-sync -v
```

Las pruebas no necesitan hardware: calculan el conjunto contra el repositorio
real y contra un árbol sintético.

## Referencias

- `firmware/esp32/MICROPYTHON_BUILD.md` — ciclo de imagen con REPL / imagen MITTEN.
- `tools/esp32-handshake-check/` — verificación del protocolo una vez instalado.
- `docs/protocol.md` — contrato del dispositivo.
