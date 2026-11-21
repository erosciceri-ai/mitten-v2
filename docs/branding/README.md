# Identidad visual MITTEN V1.2

Este directorio contiene la especificación de marca e insumos visuales de MITTEN V2 (revisión de marca V1.2, integrada en el repositorio).

## Estado actual y jerarquía

| Recurso | Rol |
|---|---|
| `docs/branding/BRAND.md` | **Especificación canónica de marca V1.2**: identidad, paleta de color, tipografía, reglas de uso del logotipo y tono visual. |
| `apps/web/public/brand/` | **Activos maestros aprobados V1.2**: 9 variantes oficiales del logotipo en SVG y PNG utilizadas directamente por la aplicación web. |
| `apps/web/DESIGN_SYSTEM.md` | **Implementación activa en frontend**: guía del sistema de diseño aplicado a componentes, accesibilidad, diseño adaptable y movimiento. |
| `apps/web/src/styles/brand-tokens.css` | **Tokens CSS en producción**: variables de color, tipografía, superficies y espaciado activas en `apps/web`. |
| `docs/branding/referencias/lamina_aprobada.jpg` | **Lámina visual aprobada V1.2**: referencia gráfica base de los activos vectoriales maestros. |

## Regla de precedencia

Ante cualquier discrepancia visual o de identidad, prevalecen `docs/branding/BRAND.md` y los activos maestros de `apps/web/public/brand/`, seguidos por la implementación definida en `apps/web/DESIGN_SYSTEM.md` y `apps/web/src/styles/brand-tokens.css`.
