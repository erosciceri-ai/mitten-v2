# MITTEN — Reglas de marca para Codex

**Estado:** identidad de marca V1.0; logotipo vectorial **V1.2 aprobado** el 10-10-2026.
**Alcance:** la marca corresponde al guante inteligente MITTEN, no a una empresa tecnológica genérica.
**Referencia de mayor autoridad para la implementación visual:** este documento y los SVG **V1.2** incluidos en `apps/web/public/brand/`. Si un documento histórico contradice estos archivos, prevalecen la versión V1.2 y estas reglas.

## Marca y mensaje
- Nombre: **MITTEN**.
- Idea central: **Comunicación**.
- Eslogan aprobado, exactamente: **CONECTA · TRADUCE · INCLUYE**.
- Personalidad: humana, tecnológica, clara, confiable.
- Descriptor: **Guante inteligente de comunicación**.
- Frase conceptual propuesta (no confundir con el eslogan): **Cada gesto tiene algo que decir.**
- Explicación funcional: MITTEN reconoce gestos previamente configurados y los asocia a mensajes de voz. La aplicación administra gestos y sincroniza el perfil activo con el guante.
- En español de Argentina, usar voseo de forma consistente en la interfaz.

## Límites de comunicación
No presentar como capacidades actuales: traducción universal de lengua de señas, traducción de idiomas, voz a texto, precisión perfecta, conversaciones de voz en tiempo real, funciones clínicas o características inexistentes en el código. El verbo «traduce» del eslogan describe el paso de gestos configurados a mensajes de voz; no una traducción lingüística universal.

## Identidad visual
- Isotipo: guante estilizado azul/cian con ondas de comunicación. **Separado** del wordmark.
- Wordmark: lettering personalizado aprobado en SVG. **Nunca recrearlo con una fuente tipográfica ni modificar la M.**
- Azul: `#1695F4`; cian: `#00D3DD`; violeta: `#7A5CFF`; blanco: `#FFFFFF`; azul oscuro: `#0B0F1A`.
- Degradado aproximado de marca: `linear-gradient(100deg,#1167FF 0%,#1695F4 42%,#02C3E9 78%,#00D3DD 100%)`.
- Inter es la fuente sugerida de UI, no del logo; mantener cualquier sistema tipográfico existente si cambiarlo compromete el diseño o causa regresiones y reportarlo.
- Estilo: tecnológico/humano, superficies oscuras, composición clara, detalles luminosos contenidos; no aplicar resplandores excesivos a controles funcionales.
- No deformar, rotar, recolorear ni separar ondas del isotipo.
- Paleta secundaria, aplicación en telas y degradado exacto de reconstrucción: sujetos a comprobación; no modificar activos maestros V1.2 para compensar diferencias visuales sin aprobación.

## Accesibilidad
- **Prohibido** texto normal en `#1695F4` o `#00D3DD` sobre blanco: los contrastes son insuficientes para WCAG AA.
- Objetivos: >= 4.5:1 en texto normal, >= 3:1 en texto grande y elementos de interfaz pertinentes; verificar los estados foco, error, selección y disabled.
- El uso del logo en tamaños reducidos debe omitir eslogan y preferir isotipo. Logo principal con eslogan >= 420 px de ancho, compacto >= 200 px; isotipo >= 32 px como puntos de partida sujetos a verificación real.
- Reglas: foco visible, navegación teclado, textos no solo por color, diseño responsive, preferencia de movimiento reducido.

## Archivos listos para web
Todos los activos están en `apps/web/public/brand/` y son archivos **V1.2**:

| Archivo | Uso previsto |
| --- | --- |
| `01_logo_principal_oscuro.svg` | Logo + eslogan sobre fondo oscuro (hero/portadas) |
| `02_logo_sin_eslogan.svg` | Logo sin eslogan, navegación y tamaños medianos |
| `03_logo_para_fondo_claro.svg` | Logo horizontal en fondos claros |
| `04_logo_blanco.svg` / `05_logo_negro.svg` | Versiones monocromáticas |
| `06_isotipo_gradiente.svg` | Isotipo sin texto |
| `07_isotipo_blanco.svg` / `08_isotipo_negro.svg` | Isotipos monocromáticos |
| `09_icono_app_oscuro.svg` | Icono conceptual para aplicación; revisar favicon pequeño |

Los SVG están trazados: no requieren ni deben intentar cargar tipografías para reproducir las letras.

## Implementación en el monorepo
- Plataforma actual: React + Vite + TypeScript, con shadcn/ui potencialmente inicializado. **Inspeccionar estado real del repositorio antes de modificar.**
- Los archivos de referencia y este documento pueden permanecer en `docs/branding/`. Los SVG/PNG listos para servirse ya están en `apps/web/public/brand/`.
- Integrar el sistema cromático en el mecanismo real de estilos (tokens CSS/Tailwind/shadcn si existen). `tokens.reference.css` es solo referencia; no se importa automáticamente.
- Empezar por logo en navegación, favicon, pantalla de acceso y layout principal existente. Adaptar gradualmente botones, superficies, estados y formularios sin alterar flujos.
- **No** modificar firmware, protocolo, paquetes de contratos, API, autenticación, base de datos, comunicación Web Serial ni algoritmos de reconocimiento salvo petición explícita.
- Mantener rutas y pruebas existentes; no añadir funciones ficticias ni pantallas de producto inventadas.
- Revisar `AGENTS.md` si existe; no reemplazarlo ni ampliarlo sin motivo. Documentar lo implementado y lo pendiente.

## Validación y versiones
- Los contornos de V1.2 fueron aprobados por el usuario. La reconstrucción vectorial procede de una lámina raster y el degradado es aproximado; no afirmar identidad RGB absoluta.
- Antes de publicar, verificar assets, build, lint/tests pertinentes, responsive, contraste y tamaños; no afirmar que se pasó una validación que no se ejecutó.
- Material histórico: `referencias/Manual_Maestro_v1_0.md` e `Identidad_Verbal_v1_0.md`. Las referencias antiguas a logos V1.0 no sustituyen a los nuevos SVG V1.2.
