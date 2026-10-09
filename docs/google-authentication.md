# Inicio de sesión con Google — MITTEN V2.1

Este documento describe la integración opcional de Google Identity Services. No modifica Protocol Version 2 ni la comunicación con el ESP32.

## Objetivo

Permitir que una persona cree o recupere su sesión MITTEN con una cuenta de Google, sin entregar contraseñas de Google al frontend ni al backend.

La autenticación con correo y contraseña continúa disponible aunque Google no esté configurado.

## Configuración

1. Crear un OAuth 2.0 Client ID de tipo **Web application** en Google Cloud.
2. Configurar la pantalla de consentimiento y los orígenes JavaScript autorizados.
3. Usar el mismo Client ID en ambos procesos:

```dotenv
# apps/api/.env
GOOGLE_CLIENT_ID=000000000000-example.apps.googleusercontent.com

# apps/web/.env.local
VITE_GOOGLE_CLIENT_ID=000000000000-example.apps.googleusercontent.com
```

Los valores reales no deben commitearse. Los archivos `.env.example` sólo documentan los nombres.

## Flujo de ingreso

```text
Google Identity Services
        │ ID token
        ▼
Frontend ── POST /api/auth/google ──▶ Backend
                                        │
                                        ├─ verifica firma, audiencia, emisor y expiración
                                        ├─ exige email verificado
                                        └─ emite una sesión MITTEN propia
```

El backend usa `google-auth-library`. Nunca confía en el correo recibido sin validar el ID token contra `GOOGLE_CLIENT_ID`.

## Identidad y vinculación

- La identidad estable de Google es el claim `sub`, no el correo.
- Una cuenta creada inicialmente con Google conserva `password_hash = NULL`.
- Si el correo ya pertenece a una cuenta MITTEN con contraseña, el login de Google se rechaza con una indicación para vincularla.
- La vinculación sólo puede realizarse desde una sesión MITTEN autenticada.
- El correo verificado por Google debe coincidir con el correo de la sesión MITTEN.
- Un `google_sub` sólo puede pertenecer a un usuario.
- La vinculación no mezcla bibliotecas: mantiene el mismo `user.id` y sus gestos existentes.

Esta política evita apropiarse de una cuenta existente basándose únicamente en una coincidencia de correo.

## Rutas

| Ruta | Sesión MITTEN | Uso |
|---|---|---|
| `POST /api/auth/google` | No | Crear sesión o registrar una cuenta nueva con Google |
| `POST /api/auth/google/link` | Sí | Vincular Google a la cuenta MITTEN actual |
| `GET /api/auth/me` | Sí | Devuelve también `googleLinked` |

## Limitaciones actuales

- No existe desvinculación desde la interfaz. Debe diseñarse junto con una política que evite dejar una cuenta sin método de acceso.
- La integración real no puede verificarse hasta configurar un Client ID y los orígenes autorizados.
- Sign in with Google autentica a la persona; no concede acceso a Drive, Gmail u otras APIs de Google.

## Preparación para publicación

La interfaz publica `/privacidad` y la enlaza desde la portada, autenticación y aplicación privada. El texto describe los datos que utiliza la implementación actual.

Antes de presentar la aplicación para verificación de marca de Google todavía se debe:

1. identificar a la persona u organización responsable y publicar un canal de contacto;
2. desplegar la portada y la política en un dominio propio verificado;
3. usar la misma URL de política en la portada y en la pantalla de consentimiento;
4. mantener el nombre MITTEN y su identidad visual consistentes en ambos lugares;
5. revisar la política cada vez que se incorporen nuevos datos, proveedores o scopes.

Referencias oficiales:

- [App Homepage](https://support.google.com/cloud/answer/13807376)
- [App Privacy Policy](https://support.google.com/cloud/answer/13806988)
- [Manage OAuth App Branding](https://support.google.com/cloud/answer/15549049)
