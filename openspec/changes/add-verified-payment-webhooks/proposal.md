# 07 · Verificación de los eventos de pago

> Bloque crítico de seguridad. No exponer tráfico público sin esta rebanada.

## Por qué

El manejador de eventos del procesador de pagos **genera su propia firma en lugar de verificar la
del remitente** (`DEFECTS.md` S-01). Toma el cuerpo recibido, lo firma con el secreto compartido, y
verifica esa firma que acaba de fabricar. La comprobación siempre pasa.

El endpoint no requiere autenticación —correctamente, porque lo llama un tercero— así que
**cualquiera puede publicar un evento falsificado**. Con una petición se puede activar la
suscripción de una empresa, cambiarle el plan, o materializar un pedido que nadie pagó.

Es el defecto más grave del levantamiento completo.

A eso se suma que el procesamiento **no es idempotente** (`DEFECTS.md` M-03) —el procesador
reintenta ante cualquier respuesta que no sea de éxito, y un reintento duplica pedidos y pagos— y
que faltan manejadores para reembolsos, disputas, caducidad de sesión y fallo de intento de pago
(`DEFECTS.md` M-09).

## Qué entra

- Verificación real de la firma, sobre el cuerpo sin procesar y con la firma que acompaña a la
  petición.
- Ventana temporal para impedir la reproducción de eventos capturados.
- Deduplicación por identificador de evento, garantizada por restricción de base y no por
  comprobación de la aplicación.
- Efectos transaccionales: se aplican todos o ninguno.
- Respuesta de éxito ante tipos no atendidos, para no provocar reintentos indefinidos.
- Confirmación dentro del plazo del procesador, con el trabajo largo encolado.
- Manejadores que faltan: caducidad de sesión, reembolso, disputa y fallo de intento de pago.
- Periodo de gracia ante un fallo de cobro, en lugar de eliminar la suscripción.
- La sincronización de asientos deja de borrar los descuentos en cada renovación.
- Registro de todo evento recibido, con reproceso manual para un administrador de plataforma.

## Qué no entra

- La materialización del pedido en sí, que es la rebanada 18. Aquí se garantiza que el disparador es
  legítimo y que se ejecuta una sola vez.

## Criterios de aceptación

- Un evento sin firma, o con firma que no corresponde, responde `400` y no produce efectos.
- Un evento legítimo reproducido fuera de la ventana temporal se rechaza.
- Reenviar un evento ya procesado responde con éxito y no repite sus efectos.
- Dos entregas simultáneas del mismo evento producen un solo efecto.
- Un tipo no atendido responde con éxito y queda registrado.
- Un fallo de cobro deja la suscripción en pago pendiente, no la elimina.
- Una renovación conserva los descuentos aplicados.
- Caducar una sesión de pago libera las existencias apartadas.
- Un administrador de plataforma puede reprocesar un evento fallido sin duplicar sus efectos.

## Riesgos

**Activar la verificación desactiva cualquier integración que hoy dependa de la ausencia de
comprobación.** Conviene revisar si algún proceso interno publica eventos contra ese endpoint antes
de cerrarlo.

**El secreto de firma tiene hoy valor por defecto vacío.** Hay que confirmar que está correctamente
configurado en cada entorno antes de que la verificación empiece a rechazar.

## Specs

`payment-webhooks` · `subscriptions-and-entitlements` (periodo de gracia, descuentos)
