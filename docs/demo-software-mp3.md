# Demo local: software + MP3

Esta guía prepara una demostración repetible de MITTEN sin guante físico. El modo demostración usa
el dispatcher oficial de Protocol V2, pero las muestras y los reconocimientos son simulados. No
valida sensores, ESP32, microSD, DFPlayer ni parlante.

## Preparación inicial

Requisitos: Node.js 20.17 o superior, Python 3.9 o superior y conexión a Internet sólo durante la
instalación inicial de Piper.

```powershell
npm install
npm run tts:setup
npm run tts:smoke
```

`tts:setup` crea `.runtime/tts` (ignorado por Git), instala `piper-tts==1.8.0` y
`lameenc==1.8.4`, descarga `es_AR-daniela-high` y actualiza el `.env` local de la API. MITTEN no
redistribuye esos binarios ni el modelo. Piper se distribuye bajo GPL-3.0, lameenc bajo LGPL-3.0 y
la voz seleccionada figura con licencia MIT en el catálogo de Piper:

- <https://pypi.org/project/piper-tts/>
- <https://pypi.org/project/lameenc/>
- <https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_AR/daniela/high>

Variables disponibles: `TTS_PROVIDER=piper`, `PIPER_EXECUTABLE`, `PIPER_MODEL` y
`PIPER_TIMEOUT_MS`. Las rutas no se exponen en `/api/ready`.

## Ejecutar la demo

```powershell
npm run dev
```

El comando inicia la API, espera `/api/ready` y después inicia la web en
`http://127.0.0.1:5173`. Los logs llevan los prefijos `[api]` y `[web]`; al cerrar el comando se
cierran ambos procesos. Si la API no responde, la web muestra “API desconectada”.

Si los puertos predeterminados 3000 o 5173 ya están ocupados, el lanzador elige automáticamente el
siguiente puerto libre y muestra la URL efectiva. Cuando `PORT` o `WEB_PORT` se definen
explícitamente, una colisión produce un error claro en lugar de cambiar el puerto configurado.

Recorrido sugerido:

1. Crear una cuenta local.
2. En el panel, elegir **Modo demostración** e iniciar el simulador.
3. Crear un gesto, capturar las muestras simuladas y guardar una frase.
4. Abrir el gesto, generar la voz y escucharla antes de continuar.
5. Sincronizar la biblioteca con el dispositivo simulado.
6. Pulsar **Preparar microSD** y guardar `mitten-microsd.zip`.
7. Volver al panel, reiniciar el dispositivo simulado y simular el reconocimiento.

El ZIP contiene `mp3/NNNN.mp3`, `manifest.json` y `COPIAR_A_MICROSD.txt`. La descarga se bloquea
si falta algún MP3 y enumera las pistas pendientes.

## Comprobaciones de software

```powershell
npm test
npm run build
npm run test:e2e
python -B -m pytest firmware/esp32/tests -q -p no:cacheprovider
npm audit
```

El E2E usa un MP3 fixture y no necesita Piper ni Internet. Para comprobar la voz real, ejecutar la
demo normal después de `tts:setup`, generar una frase y escucharla en el navegador.

## Puerta de validación física pendiente

No marcar la demo como validada con hardware hasta completar y documentar cada punto:

- [ ] Verificar orientación, rango y estabilidad de cada sensor flex y del MPU6050.
- [ ] Confirmar calibración y captura con el guante colocado en distintas manos y sesiones.
- [ ] Validar alimentación, masa común y niveles eléctricos del ESP32 y DFPlayer.
- [ ] Formatear una microSD compatible, copiar el paquete y comprobar nombres/rutas reales.
- [ ] Confirmar que cada gesto reproduce la pista correcta mediante DFPlayer y parlante.
- [ ] Probar reinicio, pérdida de alimentación, reconexión USB y recuperación de errores.
- [ ] Medir latencia y falsos positivos del reconocimiento en condiciones de uso reales.
- [ ] Registrar firmware, cableado, componentes y resultados de la sesión física.
