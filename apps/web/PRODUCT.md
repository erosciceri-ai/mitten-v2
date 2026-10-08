# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El usuario principal es la persona que utiliza el guante MITTEN para asociar gestos propios con frases habladas. Durante la etapa actual, esa persona puede recibir ayuda para la configuración inicial y la demostración escolar, pero el uso normal previsto debe ser autónomo.

## Product Purpose

MITTEN permite registrar gestos de mano, asociarlos con una frase o nombre y reproducir el audio correspondiente cuando el guante reconoce el gesto. El éxito inmediato consiste en demostrar el recorrido completo y fiable del prototipo escolar. La meta de producto es que la persona pueda comunicarse cotidianamente mediante gestos sin depender de una PC, un navegador o el backend después de configurar y sincronizar el guante.

## Positioning

MITTEN combina aprendizaje de gestos definidos por cada usuario con reconocimiento y reproducción de audio locales en un guante autónomo. La aplicación web administra la biblioteca y coordina la configuración; el ESP32 conserva el perfil sincronizado y ejecuta el reconocimiento durante el uso diario.

## Operating Context

- La configuración se realiza desde una aplicación web en español, con una cuenta personal y el guante conectado por USB mediante Web Serial.
- El usuario captura gestos, administra su biblioteca, prepara el audio y sincroniza el perfil completo con MITTEN.
- La demostración escolar debe hacer visible y comprensible el estado de conexión, captura y sincronización.
- Después de la configuración, el guante reconoce gestos y reproduce audio de forma autónoma mediante DFPlayer Mini, microSD y parlante.
- La preparación física de los archivos MP3 en la microSD es un proceso separado de la sincronización de datos.

## Capabilities and Constraints

- Cada cuenta mantiene una biblioteca privada de hasta 50 gestos, sujeta también a la capacidad anunciada por el dispositivo.
- Cada gesto conserva un identificador y una pista de audio; su nombre y sus datos físicos pueden actualizarse.
- La captura requiere un MITTEN conectado y en estado `IDLE`.
- La sincronización reemplaza de forma transaccional el perfil completo almacenado en el ESP32.
- Web Serial es el único propietario del puerto serie y requiere un navegador compatible.
- El ESP32 usa cinco sensores flex y un MPU6050; el firmware ejecuta MicroPython.
- La reproducción autónoma depende de que `/mp3/{audioTrack:04d}.mp3` exista en la microSD del DFPlayer.
- El sistema es un prototipo funcional escolar mantenible por un equipo pequeño; debe evitar infraestructura y complejidad empresarial innecesarias.
- La efectividad clínica y la idoneidad como dispositivo médico no están establecidas y no deben afirmarse.

## Brand Commitments

- Nombre del producto: MITTEN V2.
- Descripción factual: guante electrónico que traduce gestos de mano a audio hablado.
- La interfaz actual utiliza español claro y directo.
- La comunicación debe presentar el producto honestamente como prototipo escolar con aspiración de uso cotidiano autónomo.

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
