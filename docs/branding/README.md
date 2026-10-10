# Integración MITTEN V1.2 → Codex

Este paquete está preparado para descomprimirse **en la raíz del repositorio `v2/`**.

## Contenido
- `docs/branding/BRAND.md`: reglas vigentes para Codex.
- `docs/branding/tokens.reference.css`: tokens de referencia. No se inyectan en la app hasta revisarlos.
- `docs/branding/referencias/`: manual y textos complementarios, imagen aprobada.
- `apps/web/public/brand/`: 9 variantes del logotipo aprobado V1.2 en SVG y PNG.

## Instalación manual (PowerShell)
```powershell
cd 'C:\Users\Diez 20-11-24\Documents\MITTENV2\v2'
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\MITTEN_Kit_para_Codex_V1_2.zip" -DestinationPath . -Force
```
Si lo descargaste en otro lugar, ajustá `-LiteralPath`. El comando solo copia los archivos del paquete a rutas nuevas; revisá las rutas antes de extraer si ya existen. **No se modifica código productivo automáticamente.**

## Siguiente paso
Abrí Codex Desktop sobre `v2` y pedile que lea `docs/branding/BRAND.md`, examine el estado actual de `apps/web` e implemente la identidad de forma incremental. Para prioridad de marca, V1.2 reemplaza los SVG antiguos del manual V1.0.
