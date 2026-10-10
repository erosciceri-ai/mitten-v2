# MITTEN — Manual maestro de identidad de marca V1.0

**Edición:** 10 de octubre de 2026  
**Estado:** documento maestro consolidado **para validación**. La estrategia y dirección visual han sido elegidas, pero la vectorización, los tamaños mínimos y las aplicaciones técnicas deben aprobarse.  
**Referencia visual:** lámina de identidad de marca seleccionada por el equipo.  
**Fuentes consolidadas:** normas visuales v1.1, identidad verbal v1.0 y kit SVG/PNG reconstruido v1.0.

## 1. Decisiones aprobadas

- **Marca:** MITTEN, especializada en el guante tecnológico de comunicación.
- **Concepto central:** Comunicación.
- **Personalidad:** humana, tecnológica, clara y confiable.
- **Eslogan:** **CONECTA · TRADUCE · INCLUYE**.
- **Sistema de firma:** isotipo de guante con ondas de comunicación, independiente del nombre MITTEN.
- **Dirección cromática:** azul principal, cian, violeta, blanco y azul oscuro.
- **Estilo:** moderno, tecnológico, humano, simple y profesional.

## 2. Posicionamiento y plataforma de marca

**Posicionamiento:** MITTEN es una marca especializada en un guante inteligente que reconoce gestos previamente configurados y los transforma en mensajes de voz. Su aplicación permite gestionar gestos y sincronizar el perfil activo con el dispositivo.

**Propósito:** ampliar las posibilidades de comunicación mediante tecnología adaptada a gestos personalizados.

**Misión:** diseñar, desarrollar y mejorar una herramienta que transforme gestos configurados en mensajes de voz con una experiencia comprensible.

**Visión:** desarrollar un guante de comunicación reconocido por utilidad, claridad y enfoque humano.

**Promesa expresiva:** La tecnología se adapta a tu manera de comunicar.

**Diferenciación buscada:** coherencia entre dispositivo físico, gestos configurables y experiencia web. No reclamar que la personalización o la traducción por gestos son características exclusivas del producto.

**Público inicial propuesto (por validar):** personas para quienes el uso de gestos manuales configurados puede facilitar la comunicación oral; familiares/docentes/personas de apoyo; escuelas u organizaciones que evalúen sistemas de comunicación asistida. La utilidad del producto para cada grupo debe comprobarse en pruebas reales.

## 3. Valores y personalidad

1. **Comunicación:** toda característica debe ayudar a expresar información.
2. **Autonomía:** permitir que cada persona configure mensajes según sus necesidades.
3. **Innovación:** ingeniería aplicada a un problema concreto.
4. **Inclusión:** lenguaje respetuoso y soluciones diseñadas considerando distintas necesidades.

La personalidad se traduce en: humanidad sin paternalismo, tecnología sin exceso de adornos, claridad sin simplificar información importante y confianza sin promesas absolutas.

## 4. Arquitectura del logotipo

| Variante | Archivo SVG | Contexto |
|---|---|---|
| Principal con eslogan | `01_logo_horizontal_color.svg` | Portadas y hero sobre fondo oscuro |
| Horizontal reducido | `02_logo_horizontal_sin_eslogan.svg` | Barra de navegación y espacios menores |
| Isotipo degradado | `03_isotipo_gradiente.svg` | App, producto, identificadores |
| Logo blanco | `04_logotipo_blanco.svg` | Uso monocromático en fondo oscuro |
| Logo negro | `05_logotipo_negro.svg` | Uso monocromático en fondo claro |
| Isotipo blanco | `06_isotipo_blanco.svg` | Microaplicaciones oscuras |
| Isotipo negro | `07_isotipo_negro.svg` | Microaplicaciones claras |
| Firma sobre fondo claro | `08_horizontal_color_para_fondo_claro.svg` | Papelería clara |
| Icono app propuesto | `09_icono_app_fondo_oscuro.svg` | Icono digital, sujeto a revisión de tamaño |

**Nota técnica:** los SVG son vectorizaciones reales pero aproximadas del diseño elegido. No equivalen a los originales diseñados en vector. Comparar a tamaño grande y pequeño antes de aceptarlos como archivos maestros.

### Área de seguridad

Regla orientativa: **X = 25 % de la altura visible del isotipo**, tomando como referencia la forma dibujada y no el lienzo SVG. Ningún elemento ajeno debe entrar en esta zona.

### Tamaños mínimos de uso digital (hipótesis)

- Logo con eslogan: **420 px de ancho**.
- Logo sin eslogan: **200 px de ancho**.
- Isotipo: **32 px de ancho**.
- Favicon entre 16 y 24 px: crear **variante óptica simplificada** y validarla.
- Bordados y estampados: definir mínimos en milímetros solo después de pruebas físicas.

### Usos incorrectos

No deformar, rotar, estirar, separar ondas, cambiar colores fuera de la paleta, reducir el eslogan hasta hacerlo ilegible, imitar el wordmark con una fuente estándar ni colocarlo sobre fondos sin contraste.

## 5. Paleta de marca

| Nombre | Código HEX | Función |
|---|---|---|
| Azul principal | `#1695F4` | Acentos, llamadas a la acción visual |
| Cian | `#00D3DD` | Señal y énfasis tecnológico |
| Violeta | `#7A5CFF` | Acento secundario con moderación |
| Blanco | `#FFFFFF` | Contenidos sobre oscuro, espacios limpios |
| Azul oscuro | `#0B0F1A` | Superficies base, texto sobre claro |

Degradado aproximado reconstruido: `#1167FF` → `#1695F4` → `#02C3E9` → `#00D3DD`.

### Accesibilidad cromática

| Combinación | Contraste aproximado | Uso para texto normal |
|---|---:|---|
| Blanco sobre azul oscuro | 19,13:1 | Sí |
| Cian sobre azul oscuro | 10,35:1 | Sí |
| Azul principal sobre azul oscuro | 6,05:1 | Sí |
| Azul principal sobre blanco | 3,16:1 | **No** (texto normal) |
| Cian sobre blanco | 1,85:1 | **No** |
| Violeta sobre blanco | 4,37:1 | **No** (texto normal) |

Cumplimiento AA general de texto normal requiere al menos **4,5:1**. La etiqueta «sí» aplica a los colores sólidos citados; las combinaciones sobre gradientes, transparencias, botones o fondos variables deben verificarse por separado.

## 6. Tipografía

- **Logotipo:** lettering personalizado; utilizar siempre los trazados SVG proporcionados.
- **Contenido e interfaz:** **Inter** como familia recomendada, pesos 400, 500, 600 y 700.
- **Escala inicial:** encabezado principal 32-40 px; encabezado secundario 22-26 px; cuerpo 16 px; ayuda 14 px.
- **Accesibilidad:** evitar menos de 14 px en información funcional y asegurar reflujo/responsividad.
- **Nota:** las maquetas del manual usan una tipografía de maquetación equivalente, no garantizan reproducción de Inter.

## 7. Sistema gráfico

**Recursos permitidos:** repetición moderada del isotipo; ondas derivadas del símbolo; líneas redondeadas; geometría limpia; fondos oscuros con iluminación azul/cian; violeta solo como acento; espacios amplios.

**Evitar:** estética médico-hospitalaria, saturación de luces/gradientes, circuitos decorativos arbitrarios, guantes genéricos ajenos al símbolo aprobado y ornamentos que resten legibilidad.

**Iconografía digital:** trazos uniformes, esquinas redondeadas, siluetas simples; comunicar funciones reales como conectar, gestos, capturar, sincronizar y estado.

## 8. Aplicaciones

**Web pública:** presentar qué hace el guante, cómo funciona en tres pasos, estado del prototipo y una llamada a conocer el proyecto. No presentar capturas conceptuales como funcionalidades terminadas.

**Aplicación de configuración:** priorizar estados de conexión, captura de gestos, listado de gestos, sincronización, errores y confirmaciones. Mantener una acción primaria por pantalla y textos claros.

**Guante físico:** isotipo independiente en parche o carcasa, sujeto a validación de tamaños, contraste, materiales y método de producción.

**Presentaciones:** logo con eslogan para portada y firma sin eslogan para páginas interiores.

## 9. Identidad verbal

**Eslogan aprobado:** CONECTA · TRADUCE · INCLUYE.

**Frase conceptual propuesta:** Cada gesto tiene algo que decir.

**Descriptor:** Guante inteligente de comunicación.

**Explicación breve:** MITTEN transforma gestos configurados en mensajes de voz mediante un guante inteligente.

**Tono:** cercano, claro, preciso y respetuoso. En comunicación argentina, usar voseo rioplatense («configurá», «conectá», «elegí») sin mezclarlo con tuteo en la misma pieza.

**Manifiesto breve:** Comunicarnos es compartir ideas, necesidades y experiencias. No todas las personas lo hacemos de la misma manera. MITTEN explora cómo un guante configurable puede ayudar a convertir gestos en mensajes de voz, poniendo la tecnología al servicio de la expresión cotidiana.

## 10. Textos por canal

### Web (propuesta)

- **Hero:** Cada gesto tiene algo que decir.
- **Descripción:** Conocé MITTEN, un guante inteligente que transforma gestos configurados en mensajes de voz para facilitar la comunicación.
- **CTA principal:** Conocé MITTEN.
- **CTA secundario:** Cómo funciona.
- **Flujo:** Configurá → Sincronizá → Comunicá.

### Presentación breve

MITTEN es un guante de comunicación que asocia gestos personalizados con mensajes de audio. Su aplicación permite configurar y sincronizar esos gestos con el dispositivo.

### Microcopy de la aplicación (propuesta sujeta a implementación)

| Situación | Texto |
|---|---|
| Acción de conexión | Conectar guante |
| Inicio de captura | Capturar gesto |
| Guardado | El gesto se guardó en tu perfil. |
| Sincronización | Enviando los gestos de tu perfil... |
| Confirmación | Sincronización completa. El guante tiene los gestos del perfil activo. |
| Error recuperable | No se completó la sincronización. Intentá de nuevo. |
| Límite | Alcanzaste los 50 gestos. Eliminá uno para poder agregar otro. |
| Desconexión | Guante desconectado. Conectalo para capturar o sincronizar gestos. |

**Precaución:** no mostrar éxito si el dispositivo no confirmó el resultado; conservar el mensaje sobre perfil previo intacto solo si el firmware confirmó el comportamiento esperado.

## 11. Afirmaciones que se pueden y no se pueden hacer

**Precisas y recomendadas:** «reconoce gestos previamente configurados», «asocia gestos a mensajes de voz», «permite sincronizar el perfil activo», «busca facilitar la comunicación».

**No utilizar como afirmaciones de hecho sin evidencia:** «traduce cualquier lengua de señas», «no falla nunca», «reemplaza un intérprete», «voz a texto», «traducción entre idiomas», «dispositivo clínicamente validado», «cura», «da voz a quienes no la tienen».

El verbo **«traduce»** en el eslogan designa la conversión de gestos configurados en mensajes de voz; no una traducción lingüística universal.

## 12. Lista de cierre y publicación

- [ ] Revisar la fidelidad geométrica del SVG contra la lámina visual aprobada.
- [ ] Verificar degradado, grosor de línea, ondas y cada letra del wordmark.
- [ ] Evaluar logotipo a tamaños mínimos y en pantallas reales.
- [ ] Crear favicon óptico simplificado para 16-24 px.
- [ ] Validar contraste, foco y estados de la aplicación.
- [ ] Probar impresión, bordado y serigrafía sobre material definitivo.
- [ ] Revisar afirmaciones del producto con pruebas técnicas reales.
- [ ] Realizar pruebas de legibilidad/comprensión con personas usuarias.
- [ ] Comprobar antecedentes y disponibilidad de la marca y del símbolo.
- [ ] Aprobar formalmente esta edición y guardar la versión congelada.

## 13. Control de versiones

**v1.0** — Unificación de estrategia, sistema visual y verbal. Dirección de marca definida; logotipos vectoriales y normas técnicas aún pendientes de aprobación final. Documentos anteriores se conservan como fuente histórica, pero este manual reúne las decisiones de uso actuales.
