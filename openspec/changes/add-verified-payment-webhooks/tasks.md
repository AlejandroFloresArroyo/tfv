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

- [ ] Sesión de pago completada, con derivación por tipo — espera a suscripciones (11) y a la compra (17)
- [ ] Sesión de pago caducada: liberar existencias y marcar la compra — espera a suscripciones (11) y a la compra (17)
- [ ] Factura cobrada: registrar, sincronizar y avisar — espera a suscripciones (11) y a la compra (17)
- [ ] Factura próxima — espera a suscripciones (11) y a la compra (17)
- [ ] Fallo de cobro: periodo de gracia, **sin eliminar la suscripción** — espera a suscripciones (11) y a la compra (17)
- [ ] Suscripción modificada — espera a suscripciones (11) y a la compra (17)
- [ ] Suscripción terminada — espera a suscripciones (11) y a la compra (17)
- [ ] Cuenta de comercio actualizada — espera a suscripciones (11) y a la compra (17)
- [ ] Reembolso: registrar y ajustar el pago y el pedido — espera a suscripciones (11) y a la compra (17)
- [ ] Disputa: registrar y avisar — espera a suscripciones (11) y a la compra (17)
- [x] Tipo no atendido: éxito, sin efectos, con registro

## Correcciones asociadas

- [ ] La sincronización de asientos conserva los descuentos
- [ ] Periodo de gracia configurable, con transición a impagada al agotarse

## Operación

- [ ] Registro de todo evento con su verificación y su procesamiento
- [ ] Superficie de consulta para administradores de plataforma
- [ ] Reproceso manual con garantía de ejecución única
- [ ] Aviso a la operación ante fallo persistente
- [ ] Decidir el plazo de retención de las cargas útiles, que contienen datos personales

## Verificación

- [ ] Prueba: evento sin firma responde `400`
- [ ] Prueba: cuerpo alterado tras firmar responde `400`
- [ ] Prueba: evento falsificado no activa una suscripción
- [ ] Prueba: reenvío no duplica
- [ ] Prueba: fallo de cobro no elimina la suscripción
- [ ] Prueba: renovación conserva el descuento
