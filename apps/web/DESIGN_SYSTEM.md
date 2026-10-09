# MITTEN V2.1 — sistema visual

MITTEN V2.1 usa una dirección de **tecnología asistiva humana**: técnica y precisa, pero cercana. La interfaz no debe parecer un producto médico certificado ni una consola industrial.

La versión visual `V2.1` no modifica `Protocol Version 2` ni el formato de gestos.

## Principios

1. El estado real del guante siempre tiene más importancia que la decoración.
2. La interfaz pública explica; la aplicación privada permite actuar.
3. El movimiento comunica una transición o una señal. Nunca bloquea controles.
4. Los límites del prototipo se presentan con la misma claridad que sus capacidades.
5. La comunicación usa español directo, verbos activos y términos comprensibles para personas no técnicas.

## Colores

| Token | Valor | Uso |
|---|---:|---|
| `ink` | `#102A43` | Texto principal, fondos técnicos y contraste alto |
| `primary` | `#0B6477` | Acciones principales, marca y enlaces |
| `signal` | `#1AA39A` | Sensores, conexión y flujo de señal |
| `attention` | `#E59A42` | Avisos y puntos de atención, nunca como único indicador |
| `mist` | `#EDF5F5` | Superficies secundarias y agrupación |
| `surface` | `#FFFFFF` | Superficies de lectura |

Los estados de éxito, advertencia y error conservan tokens semánticos independientes. Ningún estado se comunica sólo mediante color.

## Tipografía

- Familia: `Segoe UI Variable`, `Aptos`, `Segoe UI`, `system-ui`, `sans-serif`.
- Títulos: peso 700–780, tracking levemente negativo y ajuste equilibrado.
- Texto: mínimo 16 px en contenido principal, interlineado 1.5–1.7.
- Medida recomendada: 60–75 caracteres por línea.

Se priorizan fuentes del sistema para evitar una dependencia remota y mantener rápida la aplicación local.

## Forma y composición

- Ritmo base de 4/8 px.
- Bordes discretos y radios diferenciados por jerarquía; no todas las superficies deben parecer tarjetas.
- Los diagramas y divisores deben explicar arquitectura, secuencia o agrupación.
- Los iconos son SVG con trazo consistente; no se usan emojis como iconos estructurales.

## Movimiento

- Entrada principal única en el hero: 650–780 ms.
- Respuesta de controles: 160–180 ms.
- Animar únicamente `transform` y `opacity` cuando sea posible.
- `prefers-reduced-motion: reduce` reduce todas las animaciones a una transición prácticamente instantánea.
- Las animaciones nunca determinan el estado final de una operación.

## Accesibilidad y responsive

- Contraste mínimo objetivo WCAG AA.
- Foco visible en todos los controles.
- Objetivos interactivos de al menos 44 × 44 px cuando sea viable.
- La portada se valida como mínimo a 375, 768, 1024 y 1440 px.
- La información funcional siempre se expresa mediante texto además de color o movimiento.
