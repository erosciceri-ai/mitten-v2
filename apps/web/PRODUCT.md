# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El usuario principal es la persona que utiliza el guante MITTEN para asociar gestos propios con frases habladas. Durante la etapa actual, esa persona puede recibir ayuda para la configuración inicial y la demostración escolar, pero el uso normal previsto debe ser autónomo.

La portada pública también se dirige a docentes, jurados, colaboradores y personas interesadas que necesitan comprender el proyecto antes de crear una cuenta.

## Product Purpose

MITTEN busca asociar gestos de mano personalizados con frases habladas. El prototipo permite configurar una biblioteca, capturar gestos, generar MP3 para la web y sincronizar el perfil; la reproducción autónoma usa una integración WAV inicial que todavía debe validarse en el hardware físico. La meta de producto es que la persona pueda comunicarse cotidianamente mediante gestos sin depender de una PC, un navegador o el backend después de preparar el guante.

## Positioning

MITTEN busca combinar gestos definidos por cada usuario con reconocimiento y reproducción locales en un guante autónomo. La aplicación web administra la biblioteca y coordina la configuración; el ESP32 conserva el perfil sincronizado y ejecuta el reconocimiento local.

## Operating Context

- La configuración se realiza desde una aplicación web en español, con una cuenta personal y el guante conectado por USB mediante Web Serial.
- El usuario captura gestos, administra su biblioteca, genera MP3 para escuchar o descargar desde la web y sincroniza el perfil completo con MITTEN.
- La demostración escolar debe hacer visible y comprensible el estado de conexión, captura y sincronización.
- El firmware contiene una integración inicial de reproducción WAV por microSD SPI y MAX98357A por I²S: WAV RIFF PCM mono, 16 kHz y 16 bits en `/mitten_audio/audio/NNNN.wav`. La reproducción física todavía no fue validada en la PCB.
- La API genera MP3 para las funciones web. Esos archivos no son los WAV que usa el firmware; la conversión y preparación física de WAV siguen siendo manuales y separadas de la sincronización del perfil.
- La sincronización transmite el perfil de gestos y sus identificadores `audioTrack`; no copia ni verifica archivos de audio en la microSD.

## Capabilities and Constraints

- Cada cuenta mantiene una biblioteca privada de hasta 50 gestos, sujeta también a la capacidad anunciada por el dispositivo.
- Cada gesto conserva un identificador y una pista de audio; su nombre y sus datos físicos pueden actualizarse.
- La captura requiere un MITTEN conectado y en estado `IDLE`.
- La sincronización reemplaza de forma transaccional el perfil completo almacenado en el ESP32.
- Web Serial es el único propietario del puerto serie y requiere un navegador compatible.
- El ESP32 usa cinco sensores flex y un MPU6050; el firmware ejecuta MicroPython.
- La reproducción autónoma requiere un WAV local para el `audioTrack`; sincronizar el gesto no copia ni verifica ese archivo. Véase el [plan de migración](../../docs/firmware-audio-migration.md).
- El sistema es un prototipo funcional escolar mantenible por un equipo pequeño; debe evitar infraestructura y complejidad empresarial innecesarias.
- La efectividad clínica y la idoneidad como dispositivo médico no están establecidas y no deben afirmarse.

## Brand Commitments

- Nombre de la evolución de interfaz: MITTEN V2.1. El protocolo serie permanece en Protocol Version 2.
- Descripción factual: guante electrónico que traduce gestos de mano a audio hablado.
- La interfaz actual utiliza español claro y directo.
- La comunicación debe presentar el producto honestamente como prototipo escolar con aspiración de uso cotidiano autónomo.
- La demostración pública es explicativa: debe distinguirse de una medición real y nunca insinuar precisión clínica o validación con hardware.
- El contacto público abre el cliente de correo de la persona y no almacena el mensaje en MITTEN; sólo se muestra cuando existe un canal configurado.
- La política pública debe describir el comportamiento implementado, permanecer disponible sin sesión y señalar cualquier dato institucional pendiente antes de un lanzamiento público.

## Evidence on Hand

- Requisitos y criterios de aceptación: `../../docs/requirements.md`.
- Arquitectura y responsabilidades: `../../docs/architecture.md`.
- Contrato de comunicación: `../../docs/protocol.md`.
- Formato de gestos: `../../docs/gesture-format.md`.
- Validación automatizada del recorrido sin hardware: `../../docs/software-validation.md`.
- Implementación funcional de autenticación, biblioteca, captura y sincronización en `src/`.
- No hay testimonios, estudios clínicos, métricas de uso real ni certificaciones; el diseño y el contenido no deben inventarlos.

## Product Principles

1. La persona que usa el guante debe entender qué puede hacer y qué necesita atención en cada momento.
2. La configuración debe reducir pasos y errores antes de permitir el uso autónomo.
3. Los estados del dispositivo, la captura y la sincronización deben ser explícitos y verificables.
4. La experiencia debe mantener la simplicidad apropiada para un prototipo escolar sin ocultar límites reales.
5. La autonomía del guante después de la sincronización es el resultado principal del producto.

## Accessibility & Inclusion

- Usar lenguaje breve, concreto y comprensible para personas no técnicas.
- Mantener controles claramente etiquetados, áreas de interacción cómodas y navegación por teclado.
- Comunicar estados y errores mediante texto e iconografía además del color.
- Conservar contraste legible y foco visible en todos los flujos esenciales.
- Evitar movimiento innecesario y respetar las preferencias de reducción de movimiento del sistema.
