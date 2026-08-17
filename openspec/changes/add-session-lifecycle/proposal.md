# 04 · Ciclo de vida de la sesión

> Bloque crítico de seguridad. No exponer tráfico público sin esta rebanada.

## Por qué

La autenticación actual tiene cinco agujeros, y son acumulativos:

| Ref | Problema |
|---|---|
| S-03 | Las credenciales se firman **sin caducidad**. Una filtración es permanente y no hay forma de revocar |
| S-04 | Los manejadores **decodifican** la credencial en lugar de verificarla. La identidad es lo que el solicitante diga |
| S-02 | Hay una vía alternativa que concede acceso a cualquier cadena con forma de credencial |
| S-08 | Los tokens de recuperación usan una función de dispersión **no criptográfica** y no caducan |
| S-15 | El registro marca las cuentas como verificadas, con lo que la verificación de correo **no existe** |
| S-09 | Las contraseñas temporales viajan **en claro** en las notificaciones |

Cualquiera de ellos por separado basta para comprometer una cuenta.

## Qué entra

- Sesiones con vigencia limitada y revocables.
- Renovación rotatoria, con detección de reutilización: reusar una credencial de renovación
  consumida invalida toda la cadena.
- Cierre de sesión individual y de todas las sesiones.
- Verificación de correo **efectiva**: sin verificar no se entra.
- Recuperación de contraseña con token criptográfico, de un solo uso y con caducidad.
- Respuesta indistinguible exista o no la cuenta solicitada.
- Contraseñas con función de derivación de clave y factor de trabajo ajustable.
- Requisitos mínimos y rechazo de contraseñas comunes.
- Invitación **sin contraseña generada**: enlace de un solo uso para que el titular la establezca.
- Limitación de intentos de acceso.
- Eliminación de la vía alternativa de credencial. Las claves de integración pasan a ser
  credenciales de primera clase, almacenadas de forma verificable y revocables.

## Qué no entra

- La comprobación de permisos (rebanada 05) y el aislamiento entre arrendatarios (06). Esta rebanada
  responde a *quién eres*, no a *qué puedes hacer*.
- La adopción de un servicio de autenticación gestionado (`project.md`, D-07). Los requisitos están
  escritos como comportamiento observable, de modo que adoptarlo después sea implementación.

## Criterios de aceptación

- Ninguna credencial emitida carece de caducidad.
- Una credencial con la carga útil alterada se rechaza con `401`.
- No existe ningún encabezado alternativo que conceda acceso.
- Reutilizar una credencial de renovación consumida invalida todas las sesiones de la cadena.
- Una cuenta sin verificar no puede iniciar sesión.
- Solicitar recuperación para un correo registrado y para uno inexistente produce respuestas
  idénticas.
- Ningún mensaje del sistema contiene una contraseña.
- Restablecer la contraseña invalida las sesiones anteriores.
- Superar el límite de intentos responde `429`.

## Riesgos

**Introducir la caducidad rompe a todo el mundo a la vez** si se despliega sin transición. Las
credenciales existentes no caducan, así que hay que decidir si se invalidan en el corte o se
aceptan durante una ventana. Va con la rebanada 30.

**La verificación efectiva de correo deja fuera a las cuentas existentes** que hoy figuran como
verificadas sin haberlo hecho nunca. Hay que decidir si se dan por buenas o se fuerza una
verificación al primer acceso.

## Specs

`user-accounts` · `activity-and-notifications` (invitación sin contraseña)
