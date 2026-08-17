# 18 · Compra y materialización transaccionales — trabajo

## Requisitos previos de la compra

- [ ] Comprobación de tienda publicada, suscripción vigente y servicio habilitado
- [ ] Comprobación de perfil de facturación operativo
- [ ] Comprador identificado y domicilio, salvo recolección
- [ ] Mensajes de rechazo comprensibles, sin revelar configuración interna

## Reserva con caducidad

- [ ] Validación de existencia por línea
- [ ] **Reserva efectiva** de unidades concretas al crear la sesión
- [ ] Caducidad de la reserva, alineada con la de la sesión de pago
- [ ] Liberación al caducar
- [ ] Liberación al cancelar explícitamente
- [ ] Recolector de reservas caducadas, que respete las materializaciones en curso
- [ ] Prueba de concurrencia: dos compradores, una unidad

## Precio e instantánea

- [ ] Resolución de precios en el servidor
- [ ] Descarte de los precios recibidos del navegador
- [ ] Cálculo de comisión y neto
- [ ] Envío desde la rebanada 17
- [ ] Instantánea completa persistida antes del pago
- [ ] Clave de idempotencia en la creación de la sesión

## Mosaicos

- [ ] **Subida del diseño antes de crear la sesión**
- [ ] Rechazo de la compra si el diseño no pudo conservarse
- [ ] Conservación de la imagen y el desglose de cada lámina

## Materialización

- [ ] Reclamar el evento por restricción única
- [ ] Bloquear la compra y comprobar que no está materializada
- [ ] Pago con su desglose completo
- [ ] Envío con estado inicial y fecha estimada
- [ ] Pedido de comprador con su referencia legible
- [ ] Líneas del pedido
- [ ] Alta del comprador como cliente, idempotente
- [ ] Entrada en el libro de ingresos del comercio
- [ ] Pedido operativo de almacén o de tienda de mosaicos
- [ ] Conversión de las reservas al estado definitivo
- [ ] **Marca de materialización al final de la transacción, nunca al principio**

## Corrección de importes

- [ ] Total del pedido igual a lo pagado
- [ ] Subtotal, envío y comisión registrados por separado
- [ ] Prueba: el comprobante cuadra con el cargo

## Estados y operación

- [ ] Los cuatro estados de la compra, todos alcanzables
- [ ] Registro de incidencias con detalle suficiente
- [ ] Aviso a la operación ante fallo persistente
- [ ] Reproceso manual con ejecución única

## Verificación

- [ ] Prueba: fallo a mitad no deja ninguna de las ocho entidades
- [ ] Prueba: reenvío del evento no duplica
- [ ] Prueba: sesión caducada libera el inventario
- [ ] Prueba: precio manipulado no altera lo cobrado
- [ ] Prueba: mosaico sin diseño no se cobra
- [ ] Prueba: el mosaico llega completo al pedido
