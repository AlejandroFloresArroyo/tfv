# 07 · Verificación de los eventos de pago — trabajo

## Verificación

- [x] Acceder al cuerpo sin procesar, sin transformación previa
- [x] Verificar con la firma que acompaña a la petición y el secreto compartido
- [x] Eliminar la generación de la firma propia
- [x] Ventana temporal de tolerancia
- [ ] Confirmar el secreto configurado en cada entorno antes de activar — es obligatorio en
      producción y el servicio no arranca sin él; falta ponerlo donde se despliegue
- [ ] Revisar si algún proceso interno publica contra este endpoint

## Deduplicación

- [x] Tabla de eventos recibidos con restricción única sobre el identificador del proveedor
- [x] Reclamar el evento por inserción; el conflicto significa duplicado
- [x] Responder éxito ante duplicado, sin repetir efectos
- [x] Prueba de dos entregas simultáneas

## Transaccionalidad

- [x] Todos los efectos de un evento en una transacción
- [x] Responder con error ante fallo, para provocar el reintento
- [ ] Confirmar la recepción dentro del plazo del procesador
- [ ] Encolar el trabajo que no quepa en ese plazo, conservando la ejecución única

## Manejadores

- [x] Sesión de pago completada, con derivación por tipo — `onCheckoutCompleted` en
      `apps/api/src/billing/events.ts:147`, que deriva por la metainformación de la sesión y deja
      constancia cuando no la trae. Prueba `billing/subscriptions.test.ts:423`. La compra en
      tienda no pasa por aquí: llega por `payment_intent.*`, que es su propia fila de la tabla
- [ ] Sesión de pago caducada: liberar existencias y marcar la compra — **el efecto está y el
      manejador no**: la liberación la hace el barrido de caducidad
      (`apps/api/src/checkout/expiry.ts`, probado en la 18) y `checkout.session.expired` no
      figura en `BILLING_HANDLERS`, así que si el procesador lo manda cae en «sin manejador»
- [ ] Factura cobrada: registrar, sincronizar y avisar — **dos de tres**: `onInvoicePaid`
      registra el cobro y sincroniza (`billing/events.ts`, pruebas
      `subscriptions.test.ts:879` y `:853`), y **no avisa a nadie**. El despachador de avisos
      existe desde la 09, así que es trabajo que se puede hacer hoy
- [ ] Factura próxima — sin manejador: `invoice.upcoming` no figura en `BILLING_HANDLERS`. Ya no
      espera a nadie
- [x] Fallo de cobro: periodo de gracia, **sin eliminar la suscripción** — `onInvoiceFailed`
      concede gracia en vez de borrar, que es la corrección de `DEFECTS.md` M-08. Prueba
      `billing/subscriptions.test.ts:808`: «pasa a pago pendiente y no elimina la suscripción»
- [x] Suscripción modificada — `onSubscriptionUpdated`, con la prueba en el sitio donde más
      peligro tenía: `billing/subscriptions.test.ts:777`, «una renovación del procesador tampoco
      lo borra», que es el descuento de M-07 sobreviviendo al manejador que corre cada ciclo
- [ ] Suscripción terminada — **implementada y sin prueba**: `onSubscriptionDeleted` está en
      `billing/events.ts:354` y ninguna prueba envía `customer.subscription.deleted`
- [x] Cuenta de comercio actualizada — `onAccountUpdated`, con las dos caras probadas en
      `billing/merchants.test.ts:650` y `:675`: la cuenta habilitada y sin pendientes activa el
      perfil, y la que no lo está no lo activa
- [x] Reembolso: registrar y ajustar el pago y el pedido — `onChargeRefunded`. Prueba
      `checkout/checkout.test.ts:921`, que comprueba las dos filas: el pedido queda `refunded` y
      el pago también, con su importe devuelto
- [ ] Disputa: registrar y avisar — **la mitad**: `onDisputeOpened` y `onDisputeClosed` marcan el
      pago y está probado (`checkout/checkout.test.ts:944`), y **no avisa a nadie**. Un
      contracargo que nadie ve es justo el que se pierde por no contestarlo a tiempo
- [x] Tipo no atendido: éxito, sin efectos, con registro

## Correcciones asociadas

- [x] La sincronización de asientos conserva los descuentos — es `DEFECTS.md` M-07, donde la pila
      anterior reescribía las líneas con `discounts: []` en cada ciclo. Probado por los dos
      caminos: al sincronizar asientos a mano (`billing/subscriptions.test.ts:753`) y al llegar
      la renovación del procesador (`:777`)
- [x] Periodo de gracia configurable, con transición a impagada al agotarse — el barrido
      `EXPIRE_GRACE` corre programado (`apps/api/src/jobs/handlers.ts:229`) sobre
      `BILLING_GRACE_SWEEP_EVERY_MS`. Pruebas `billing/subscriptions.test.ts:837` (al agotarse
      pasa a impagada) y `:853` (un cobro posterior restablece)

## Operación

- [x] Registro de todo evento con su verificación y su procesamiento — la tabla `payment_events`
      guarda carga útil, `signature_verified`, recepción, procesamiento, fallo, intentos y último
      error (`packages/db/src/schema/commerce.ts:51-72`). Pruebas
      `payments/webhooks.test.ts:129` (un reintento no duplica), `:146` (dos entregas simultáneas
      dejan una sola fila) y `:167` (un tipo desconocido responde éxito y deja constancia)
- [ ] Superficie de consulta para administradores de plataforma
- [ ] Reproceso manual con garantía de ejecución única
- [ ] Aviso a la operación ante fallo persistente
- [ ] Decidir el plazo de retención de las cargas útiles, que contienen datos personales

## Verificación

- [x] Prueba: evento sin firma responde `400` — `payments/webhooks.test.ts:55`, que además afirma
      que no queda ninguna fila
- [x] Prueba: cuerpo alterado tras firmar responde `400` — `payments/webhooks.test.ts:63`: se
      firma un cuerpo y se envía otro. Es lo que la pila anterior no hacía, porque firmaba lo
      recibido y verificaba su propia firma (`DEFECTS.md` S-01)
- [x] Prueba: evento falsificado no activa una suscripción — `payments/webhooks.test.ts:75`: se
      firma con un secreto que no es el nuestro, responde `400` y no se escribe ninguna fila, así
      que no llega a haber manejador que activar
- [x] Prueba: reenvío no duplica — `payments/webhooks.test.ts:129` para el reintento en serie y
      `:146` para dos entregas simultáneas, que es el caso que la restricción única tiene que
      ganar
- [x] Prueba: fallo de cobro no elimina la suscripción — `billing/subscriptions.test.ts:808`,
      «pasa a pago pendiente y no elimina la suscripción». Es `DEFECTS.md` M-08
- [x] Prueba: renovación conserva el descuento — `billing/subscriptions.test.ts:777`, enviando
      `customer.subscription.updated` de verdad. Es `DEFECTS.md` M-07
