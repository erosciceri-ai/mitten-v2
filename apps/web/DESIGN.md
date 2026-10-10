---
name: "MITTEN V2.1"
description: "La señal que encuentra voz: un sistema oscuro, técnico y humano para explicar y operar MITTEN con claridad."
colors:
  brand-blue: "#1695F4"
  brand-blue-hover: "#37B6FF"
  brand-blue-deep: "#102D4C"
  signal-cyan: "#00D3DD"
  attention-violet: "#7A5CFF"
  navy: "#0B0F1A"
  surface: "#101D30"
  surface-elevated: "#16263D"
  mist: "#14243A"
  border: "#2A3C57"
  input-border: "#38506F"
  foreground: "#F7FBFF"
  muted: "#B6C5D8"
  success: "#5DE0B7"
  success-surface: "#102D2B"
  warning: "#F2B35E"
  warning-surface: "#352718"
  error: "#FF8F9B"
  error-surface: "#351C25"
typography:
  display:
    fontFamily: "Inter, Segoe UI Variable, Aptos, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(3rem, 6.8vw, 5.8rem)"
    fontWeight: 760
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter, Segoe UI Variable, Aptos, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.15rem, 4.7vw, 4.1rem)"
    fontWeight: 730
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, Segoe UI Variable, Aptos, Segoe UI, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, Segoe UI Variable, Aptos, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, Segoe UI Variable, Aptos, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 760
    lineHeight: 1.2
    letterSpacing: "0.03em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  panel: "16px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    textColor: "{colors.navy}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "44px"
  button-ghost:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "44px"
  button-destructive:
    backgroundColor: "{colors.error-surface}"
    textColor: "{colors.error}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "44px"
  field:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "10px 13px"
    height: "44px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "24px"
  status-badge:
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
    height: "28px"
  progress-track:
    backgroundColor: "{colors.navy}"
    rounded: "{rounded.pill}"
    height: "8px"
---

# Design System: MITTEN V2.1

## Overview

**Creative North Star: "La señal que encuentra voz"**

MITTEN convierte una lectura técnica en una intención humana: la interfaz hace visible cómo una señal nace en la mano, atraviesa el sistema y termina en una frase. El mundo visual es integralmente oscuro, preciso y sereno; el azul y el cian dibujan recorridos, estados y acciones sin convertir cada control en un efecto luminoso.

La portada puede ser persuasiva y editorial, pero siempre explica capacidades reales. La aplicación privada es más densa y operativa: estado del dispositivo, siguiente paso y resultado verificable preceden a la decoración. En ambos contextos, la marca V1.2, el lenguaje directo y la honestidad del prototipo mantienen una sola voz.

**Key Characteristics:**

- Navy profundo continuo, con superficies técnicas claramente escalonadas.
- Azul y cian como señal activa; violeta sólo como acento moderado.
- Tipografía Inter firme, grande y compacta en títulos, legible y respirada en contenido.
- Una acción primaria inequívoca por pantalla o bloque decisivo.
- Estados reales expresados con texto, iconografía y color semántico.
- Logotipos oficiales V1.2 consumidos como activos, nunca reconstruidos.

## Colors

La paleta se organiza como un entorno nocturno de instrumentación: los neutros construyen profundidad y los colores de marca aparecen donde existe señal, identidad o acción.

### Primary

- **Azul de vínculo:** es el azul oficial que identifica enlaces, selección y momentos de marca; su variante clara pertenece a hover y realce, mientras el azul profundo sostiene estados activos discretos.
- **Cian de señal:** comunica conexión, foco, avance y circulación de datos. También es el color de selección y del indicador que confirma que una señal está viva.

### Secondary

- **Violeta de atención:** acento moderado para completar el gradiente oficial o distinguir un detalle excepcional. No compite con el cian por el estado operativo.

### Tertiary

- **Verde de confirmación:** expresa éxito real y estados completados.
- **Ámbar de cautela:** señala demostración, preparación física o una condición que requiere atención sin bloquear.
- **Coral de error:** expresa error, invalidez y acciones destructivas; siempre se acompaña con texto o iconografía.

### Neutral

- **Navy de origen:** superficie raíz de toda la experiencia y ancla de contraste.
- **Panel técnico:** base de tarjetas, consolas y agrupaciones funcionales.
- **Panel elevado:** diferencia campos y controles del panel que los contiene.
- **Niebla azul:** estado sutil de hover, iconos contenidos y agrupaciones secundarias.
- **Línea estructural:** separa regiones sin fragmentar la pantalla en demasiadas cajas.
- **Blanco frío:** texto principal y contenido que debe dominar.
- **Azul grisáceo:** texto secundario accesible, explicaciones y metadatos.

**The Signal Is Scarce Rule.** El azul, el cian y el gradiente se reservan para marca, señal y acción; si todo brilla, nada comunica prioridad.

**The Semantic Truth Rule.** Éxito, advertencia y error conservan sus colores propios y nunca dependen sólo del color para transmitir significado.

## Typography

**Display Font:** Inter (con `Segoe UI Variable`, `Aptos`, `Segoe UI`, `system-ui` y `sans-serif` como fallback local)

**Body Font:** Inter (con el mismo fallback local)

**Character:** Una sola familia sostiene tanto la escala editorial de la portada como la precisión compacta de la aplicación. Los títulos son firmes, con tracking negativo y saltos equilibrados; el cuerpo conserva aire suficiente para explicar estados técnicos sin volverse frío.

### Hierarchy

- **Display** (peso 760, escala fluida, interlineado 0.98): titulares de portada breves y persuasivos, con un máximo visual cercano a 12–14 caracteres por línea.
- **Headline** (peso 730, escala fluida, interlineado 1.04): encabezados de sección pública y grandes transiciones narrativas.
- **Title** (peso 700, 1.2rem, interlineado 1.2): títulos de panel, estado vacío y bloques operativos.
- **Body** (peso 400, 1rem, interlineado 1.5–1.7): instrucciones, explicaciones y contenido principal, idealmente entre 60 y 75 caracteres por línea.
- **Label** (peso 760, 0.75rem, tracking 0.03em): cejas, estados compactos y metadatos; usa sentence case salvo siglas técnicas.

**The Local First Type Rule.** Inter es la primera opción, pero no se descarga desde un servicio remoto; el stack local debe conservar jerarquía y legibilidad.

**The Logo Is Not Type Rule.** El wordmark nunca se recrea con Inter ni con otra fuente: sólo se muestran los SVG oficiales V1.2 sin editar.

## Layout

El sistema sigue un ritmo base de 4/8 px. La portada usa un contenedor centrado de hasta 1180px, secciones amplias y composiciones de dos columnas que alternan argumento y evidencia. La aplicación prioriza una columna de lectura clara, encabezados con acción lateral en escritorio y paneles apilados que conservan el orden operativo.

Los puntos de control obligatorios son 375, 768, 1024 y 1440 px. Debajo de 900px, las narrativas de dos columnas pasan a una; debajo de 768px, encabezados y acciones se apilan y la navegación privada se convierte en barra inferior persistente. Debajo de 620px, el wordmark de navegación cede al isotipo oficial. No hay scroll horizontal involuntario y los objetivos interactivos procuran un mínimo de 44 × 44 px.

**The One Primary Path Rule.** Cada pantalla o bloque decisivo presenta una única acción primaria; las alternativas se expresan como outline, ghost o enlaces.

**The State Before Ornament Rule.** En flujos privados, el estado real, la próxima acción y su consecuencia ocupan la jerarquía antes que cualquier recurso narrativo.

## Elevation & Depth

La profundidad combina capas tonales, bordes fríos y sombras ambientales. Las superficies permanecen sólidas y legibles; el brillo azul/cian se concentra en acciones primarias, progreso y señal, nunca alrededor de todos los controles.

### Shadow Vocabulary

- **Control activo** (`0 12px 30px rgb(22 149 244 / 0.24)`): acompaña la llamada primaria y crece apenas en hover.
- **Panel operativo** (`0 18px 46px rgb(0 0 0 / 0.20)`): separa paneles funcionales del fondo sin efecto flotante exagerado.
- **Superficie protagonista** (`0 24px 70px rgb(0 0 0 / 0.30)`): reservada para tableros, contacto o siguiente paso destacado.
- **Cabecera translúcida** (`0 8px 30px rgb(0 0 0 / 0.20)`): refuerza navegación sticky y mantiene contexto.

**The Tonal First Rule.** La jerarquía se resuelve primero con navy, panel y panel elevado; la sombra confirma la separación, no la reemplaza.

**The Contained Glow Rule.** Los resplandores sólo acompañan señal o acción y deben permanecer contenidos, sin nubes decorativas sobre controles funcionales.

## Shapes

La geometría es técnica pero amable: radios pequeños en detalles, medianos en controles y amplios en paneles. Los contenedores usan esquinas de 16px; botones y campos se mantienen cerca de 10–12px; badges, progreso e indicadores circulares usan forma pill. Los bordes de 1px definen estructura y permiten reducir la cantidad de tarjetas.

El isotipo, los indicadores y los nodos de señal aportan la silueta curva del sistema. No se deforma, rota, recolorea ni separa ninguna parte de los activos oficiales.

**The Radius Follows Hierarchy Rule.** Cuanto mayor y más estructural es la superficie, mayor puede ser su radio; no se aplica el mismo redondeo a cada agrupación.

## Components

### Buttons

- **Shape:** rectángulo compacto y amable, con radio amplio (12px) y altura mínima operativa (44px).
- **Primary:** gradiente oficial azul–cian, texto navy y sombra azul contenida; se usa una sola vez por pantalla o bloque decisivo.
- **Hover / Focus:** el hover aclara el gradiente y eleva apenas la sombra; el foco visible usa un anillo de 3px, separado del control. La respuesta dura 150–180ms y `active` desplaza 1px.
- **Outline / Ghost / Destructive:** outline conserva borde estructural, ghost reduce peso y destructive usa coral sobre superficie de error. Ninguna variante compite visualmente con la primaria.

### Chips

- **Style:** badges pill de 28px, borde translúcido, fondo tonal y texto semántico. Se usan para conexión, disponibilidad y estados compactos.
- **State:** el nombre del estado permanece visible; icono y color lo refuerzan, pero nunca lo sustituyen.

### Cards / Containers

- **Corner Style:** paneles estructurales de 16px; avisos internos de aproximadamente 14px.
- **Background:** panel técnico para la base y panel elevado para controles anidados.
- **Shadow Strategy:** tonal first; la sombra ambiental se reserva para paneles con verdadera jerarquía.
- **Border:** línea estructural de 1px para separar regiones y estados.
- **Internal Padding:** 16–24px en operación y hasta 32–64px en bloques narrativos amplios.

### Inputs / Fields

- **Style:** fondo elevado, borde de entrada visible, radio cercano a 10px y altura mínima de 44px; las etiquetas permanecen siempre visibles.
- **Focus:** el borde vira a cian y aparece un anillo cian translúcido de 3px.
- **Error / Disabled:** el error usa borde coral y halo tonal; disabled conserva contexto, reduce opacidad y explica por qué la acción no está disponible.

### Navigation

La cabecera oscura translúcida mantiene el logo oficial y estados globales. El item activo usa una superficie azul profunda con señal azul/cian; los estados inactivos son sobrios. En móvil, la navegación privada pasa a una barra inferior fija, con icono y etiqueta, mientras el logo horizontal cambia al isotipo.

### Signal Console

La consola de señal es el componente distintivo: cinco canales de sensor, una ruta secuencial y un resultado hablado. Usa cian y azul para actividad, números tabulares para lecturas y animación sólo para indicar transición real. Con reducción de movimiento, la información permanece completa y estática.

### Brand Mark

`BrandMark` selecciona el activo oficial según superficie y espacio: wordmark sin eslogan en navegación, firma completa en portada, variante para fondo claro sólo cuando corresponde e isotipo en móvil. Los SVG se consumen como archivos y nunca se reconstruyen, editan ni incorporan como SVG inline.

## Do's and Don'ts

### Do:

- **Do** mantener el navy como fondo integral y construir profundidad con panel, panel elevado, borde y sombra ambiental.
- **Do** reservar el gradiente oficial para la acción primaria, el progreso destacado y momentos inequívocos de marca.
- **Do** mostrar estados de conexión, captura, sincronización y error con texto, iconografía y color semántico.
- **Do** usar los SVG oficiales V1.2 sin editar y cambiar al isotipo cuando el wordmark pierda legibilidad.
- **Do** comprobar 375, 768, 1024 y 1440 px, foco visible, contraste WCAG AA y `prefers-reduced-motion`.
- **Do** mantener una portada persuasiva pero factual y una aplicación privada orientada a completar tareas.

### Don't:

- **Don't** presentar MITTEN como traductor universal de lengua de señas, dispositivo médico o sistema con precisión perfecta.
- **Don't** usar azul o cian como único indicador de estado ni como texto normal sobre blanco.
- **Don't** aplicar gradientes, resplandores o tarjetas a cada elemento; la rareza sostiene la jerarquía.
- **Don't** recrear el wordmark con una fuente, modificar la M, separar las ondas ni recolorear los logos.
- **Don't** introducir fuentes remotas, emojis como iconos de UI o dependencias visuales sin una necesidad concreta.
- **Don't** ocultar la acción primaria, el estado del dispositivo o los límites del prototipo detrás de decoración.
