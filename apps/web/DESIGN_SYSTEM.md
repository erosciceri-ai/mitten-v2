# MITTEN V2.1 — sistema visual V1.2

La interfaz aplica la identidad oficial MITTEN V1.2 como un sistema oscuro, técnico y humano. La experiencia debe hacer visible el estado real del guante antes que la decoración y no debe sugerir certificación médica ni capacidades que el prototipo no tiene.

La versión visual no modifica `Protocol Version 2`, el formato de gestos, autenticación, Web Serial, reconocimiento ni sincronización.

## Autoridad

Ante una contradicción se aplica este orden:

1. Requisitos, comportamiento y límites reales de MITTEN.
2. `docs/branding/BRAND.md` para identidad, color, logotipo y lenguaje de marca.
3. Los SVG maestros de `apps/web/public/brand/` para toda representación del logotipo.
4. Este documento para la aplicación técnica de la identidad en el frontend.
5. Referencias y bibliotecas externas.

Los SVG oficiales se consumen como archivos. No se redibujan, recolorean, deforman ni editan.

## Principios

1. El estado real del dispositivo y la acción primaria dominan cada pantalla.
2. La aplicación pública explica; la privada permite actuar con claridad.
3. El degradado identifica acciones y momentos de marca, no reemplaza estados semánticos.
4. El movimiento comunica transición o señal y nunca bloquea controles.
5. Los límites del prototipo se expresan con la misma claridad que sus capacidades.
6. El texto usa español directo y voseo argentino consistente.

## Tokens de color

| Token | Valor | Uso |
|---|---:|---|
| `background` | `#0B0F1A` | Fondo oficial y superficie raíz |
| `surface` | `#101D30` | Paneles y tarjetas |
| `surface-elevated` | `#16263D` | Controles y paneles elevados |
| `border` | `#2A3C57` | Bordes y separadores |
| `foreground` | `#F7FBFF` | Texto principal |
| `muted` | `#B6C5D8` | Texto secundario accesible |
| `primary` | `#1695F4` | Azul de marca y enlaces |
| `signal` | `#00D3DD` | Cian de señal y conexión |
| `attention` | `#7A5CFF` | Violeta, sólo como acento moderado |

El degradado oficial va de azul a cian y se reserva para llamadas a la acción principales, indicadores de avance destacados y detalles de marca. No se usa como texto corrido ni como único indicador de estado.

Éxito, advertencia y error mantienen colores semánticos independientes y siempre incluyen texto o iconografía. Las superficies auxiliares son derivados técnicos del fondo; no son nuevos colores de marca.

## Tipografía

- Familia: `Inter`, `Segoe UI Variable`, `Aptos`, `Segoe UI`, `system-ui`, `sans-serif`.
- No se descarga una fuente remota. Si Inter no está disponible, se usa el stack local.
- Títulos: peso 700–780, tracking levemente negativo y longitud equilibrada.
- Texto: mínimo 16 px en contenido principal, interlineado 1.5–1.7.
- Medida recomendada: 60–75 caracteres por línea.
- Etiquetas y controles usan sentence case; las mayúsculas se reservan para siglas técnicas.

## Marca y activos

`BrandMark` encapsula la elección del activo oficial:

| Contexto | Activo |
|---|---|
| Navegación oscura | `02_logo_sin_eslogan.svg` |
| Firma principal oscura | `01_logo_principal_oscuro.svg` |
| Superficie clara excepcional | `03_logo_para_fondo_claro.svg` |
| Móvil o espacio compacto | `06_isotipo_gradiente.svg` |
| Favicon | `09_icono_app_oscuro.svg` |

El logotipo principal sólo aparece cuando conserva su tamaño legible. En espacios pequeños se usa el isotipo; nunca se reconstruye el símbolo con CSS o SVG inline.

## Componentes y composición

- Ritmo base de 4/8 px.
- Radios y elevación dependen de jerarquía; no toda agrupación se convierte en tarjeta.
- `button.tsx` es la base para botones. Una pantalla mantiene una acción primaria inequívoca.
- `mitten-ui.tsx` centraliza encabezados, paneles, badges, progreso y estados vacíos.
- Los campos usan los tokens globales, etiqueta visible, foco claro y mensajes asociados.
- Los iconos estructurales usan Lucide o activos oficiales; no se usan emojis como iconos de UI.
- Navegación, conexión, captura y sincronización mantienen mayor contraste que la decoración.

## Responsive

- Puntos de control mínimos: 375, 768, 1024 y 1440 px.
- La navegación privada pasa a barra inferior móvil sin ocultar el contenido ni los avisos.
- El logotipo cambia al isotipo cuando el ancho no garantiza legibilidad.
- No se permite desplazamiento horizontal involuntario.
- Los objetivos interactivos intentan conservar al menos 44 × 44 px.

## Accesibilidad

- Contraste objetivo WCAG AA para texto, controles, estados y foco.
- El foco es visible con teclado en todos los controles.
- Ningún estado depende únicamente del color.
- Estados asincrónicos relevantes usan nombres accesibles y regiones `aria-live` cuando corresponde.
- Los controles deshabilitados conservan explicación contextual.
- El orden visual coincide con el orden de lectura.

## Movimiento

- Respuesta de controles: 160–180 ms.
- Animar preferentemente `transform` y `opacity`.
- `prefers-reduced-motion: reduce` elimina desplazamientos y reduce transiciones a una duración prácticamente instantánea.
- La animación nunca determina el resultado de una operación.

## Herramientas y dependencias

- shadcn/ui y Radix se aprovechan cuando ya existen en el proyecto.
- CSS y Motion son la primera opción para transiciones habituales.
- Magic UI o React Bits sólo se incorporan si resuelven una necesidad concreta y se adaptan a estos tokens.
- GSAP y Lenis quedan reservados para necesidades narrativas complejas; no se usan en flujos operativos.
- No se instalan dependencias por conveniencia visual ni se mezclan sistemas de estilos sin una razón documentada.
