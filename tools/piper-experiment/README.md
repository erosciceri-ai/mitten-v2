# Piper · experimento de Fase 5B

El [benchmark de referencia](https://github.com/erosciceri-ai/mitten-v2/actions/runs/43309963458/job/131503149063) registró cuatro generaciones de 31–52 s, un 504 a 60,101 s, 256,87 MiB de pico y throttling en los 2.193 períodos de CPU. Cada petición abre Python, importa el runtime, carga el modelo en una sesión ONNX, sintetiza WAV y codifica MP3. La concurrencia de API es uno. Los hilos internos de ONNX son independientes de ese límite. El ahorro de limitar hilos y de reutilizar el modelo bajo la cuota sigue por medir. [Opciones ONNX](https://onnxruntime.ai/docs/performance/tune-performance/threading.html)

## Diseño y ejecución

- Seis combinaciones con las mismas frases corta y larga y tres repeticiones HTTP por frase. Tres voces por dos opciones ONNX: valores por defecto y un hilo intra/inter, modo secuencial y spinning desactivado. El ajuste de un hilo evalúa ese conjunto de parámetros.
- La revisión de voces es `ae9d8352b73c1b1750748843e753a504b00e05b0`. El job registra SHA-256 de ONNX, JSON y tarjeta, y versiones instaladas de Piper, ONNX Runtime y lameenc. Comparar corridas con las mismas versiones y clase de runner.
- Daniela High es español argentino. Su ficha indica dataset CC BY-SA 4.0 y ajuste desde Lessac. ALD Medium es español mexicano. Su ficha indica dataset Unlicense y ajuste desde davefx. ALD X-low es español mexicano y su ficha describe datos sintéticos de ALD Medium y frases de Tatoeba, sin indicar una licencia separada. Las tres fichas indican 22.050 Hz. Revisar las condiciones del modelo y del audio antes de redistribuir. [Daniela](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_AR/daniela/high/MODEL_CARD) · [ALD Medium](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/medium/MODEL_CARD) · [ALD X-low](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/x_low/MODEL_CARD)
- La fase HTTP usa Express con SQLite descartable y 0,1 CPU, 512 MiB sin swap. Registra health, tiempos HTTP, 429/504, memoria pico/OOM, CPU y throttling. La sonda separa importaciones, carga, síntesis WAV y tiempo total del helper. El tiempo HTTP incluye lanzamiento del intérprete, codificación y persistencia. Un timeout puede dejar mediciones parciales.
- La fase de reutilización corre en un contenedor separado con la misma cuota. Ejecuta el mismo helper seis veces en un intérprete y una sesión ONNX. Compara carga, primera síntesis y repeticiones. El ensayo mide el ahorro potencial antes de diseñar IPC, cola y recuperación.
- FFmpeg comprueba la decodificación. Range y ZIP usan un job independiente con MP3 sintético válido almacenado por la API. Comprueba 206, Content-Range, bytes, CRC, manifiesto y pistas. Los resultados CI contienen diagnósticos y fichas. Los pesos y MP3 quedan fuera de Git y de los artefactos.

Un push a staging que cambie archivos del experimento activa la matriz solo con `MITTEN_PIPER_EXPERIMENT_ENABLED=true`. Dejar `MITTEN_STAGING_DEPLOY_ENABLED=false`. No se habilitó ninguna variable. GitHub exige que el workflow exista en la rama por defecto para ofrecer el disparo manual. En Linux con Docker, Node 24, curl, Python y FFmpeg, ejecutar desde la raíz:

```sh
bash tools/piper-experiment/run.sh tts es_MX-ald-x_low one 60000 /tmp/mitten-ald
bash tools/piper-experiment/run.sh transport es_AR-daniela-high default 60000 /tmp/mitten-transport
```

90, 120 o 180 s son opciones diagnósticas. Una respuesta que supere 60 s sigue siendo inelegible. El workflow de CI original conserva sus verificaciones.

## Decisión y alternativas

Exigir todos los HTTP de síntesis dentro de 60 s, 429 para el exceso concurrente, health 200, MP3 decodificable y cero OOM. Como objetivo propuesto, buscar medianas de hasta 15 s para la frase corta y 30 s para la larga. Repetir en varios runners y aumentar la muestra antes de estimar p95. Evaluar a ciegas inteligibilidad, ritmo, pronunciación y acento con usuarios argentinos y validar el audio resultante en el hardware objetivo (microSD SPI + MAX98357A; experimento originalmente redactado cuando se evaluaba DFPlayer). Preferir Daniela si cumple. Un cambio a español mexicano requiere mejora sostenida y aceptación del acento.

Si la carga explica una parte sustancial y la sesión reutilizada cumple la latencia, proponer un proceso persistente único con cola acotada, reinicio y medición de memoria retenida. Requiere aprobación y validación con Express. Si la inferencia sigue lenta, evaluar Piper en un equipo Linux ya disponible. Para un ensayo no comercial, el proveedor ElevenLabs existente ofrece 10.000 créditos mensuales en el plan gratuito y exige atribución. Revisar consumo por modelo, privacidad y límites antes de usarlo con usuarios. [Planes](https://elevenlabs.io/pricing) · [Condiciones gratuitas](https://elevenlabs.io/docs/overview/administration/billing)

La imagen, la voz y el timeout de producción conservan su configuración.
