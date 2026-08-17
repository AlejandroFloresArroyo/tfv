# 07 · Verificación de los eventos de pago — trabajo

## Verificación

- [ ] Acceder al cuerpo sin procesar, sin transformación previa
- [ ] Verificar con la firma que acompaña a la petición y el secreto compartido
- [ ] Eliminar la generación de la firma propia
- [ ] Ventana temporal de tolerancia
- [ ] Confirmar el secreto configurado en cada entorno antes de activar
- [ ] Revisar si algún proceso interno publica contra este endpoint

## Deduplicación

- [ ] Tabla de eventos recibidos con restricción única sobre el identificador del proveedor
- [ ] Reclamar el evento por inserción; el conflicto significa duplicado
- [ ] Responder éxito ante duplicado, sin repetir efectos
- [ ] Prueba de dos entregas simultáneas

## Transaccionalidad

- [ ] Todos los efectos de un evento en una transacción
- [ ] Responder con error ante fallo, para provocar el reintento
- [ ] Confirmar la recepción dentro del plazo del procesador
- [ ] Encolar el trabajo que no quepa en ese plazo, conservando la ejecución única

## Manejadores

- [ ] Sesión de pago completada, con derivación por tipo
- [ ] Sesión de pago caducada: liberar existencias y marcar la compra
- [ ] Factura cobrada: registrar, sincronizar y avisar
- [ ] Factura próxima
- [ ] Fallo de cobro: periodo de gracia, **sin eliminar la suscripción**
- [ ] Suscripción modificada
- [ ] Suscripción terminada
- [ ] Cuenta de comercio actualizada
- [ ] Reembolso: registrar y ajustar el pago y el pedido
- [ ] Disputa: registrar y avisar
- [ ] Tipo no atendido: éxito, sin efectos, con registro

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
