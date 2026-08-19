# 18 · Compra y materialización transaccionales — trabajo

> **La vertical de mosaicos queda fuera**, y con ella cuatro casillas: sus artículos son productos
> de Pixit o mosaicos configurados, y ese catálogo es la rebanada 24 —pausada—. El modelo ya los
> admite (`CheckoutLine.kind`, con su desglose de láminas y colores) y el carrito los rechaza con
> su motivo, así que lo que falta es la vertical, no la compra.

## Requisitos previos de la compra

- [x] Comprobación de tienda publicada, suscripción vigente y servicio habilitado
- [x] Comprobación de perfil de facturación operativo
- [x] Comprador identificado y domicilio, salvo recolección
- [x] Mensajes de rechazo comprensibles, sin revelar configuración interna

## Reserva con caducidad

- [x] Validación de existencia por línea
- [x] **Reserva efectiva** de unidades concretas al crear la sesión
- [x] Caducidad de la reserva, alineada con la de la sesión de pago
- [x] Liberación al caducar
- [x] Liberación al cancelar explícitamente
- [x] Recolector de reservas caducadas, que respete las materializaciones en curso
- [x] Prueba de concurrencia: dos compradores, una unidad

## Precio e instantánea

- [x] Resolución de precios en el servidor
- [x] Descarte de los precios recibidos del navegador
- [x] Cálculo de comisión y neto
- [x] Envío desde la rebanada 17
- [x] Instantánea completa persistida antes del pago
- [x] Clave de idempotencia en la creación de la sesión

## Mosaicos

- [ ] **Subida del diseño antes de crear la sesión**
- [ ] Rechazo de la compra si el diseño no pudo conservarse
- [ ] Conservación de la imagen y el desglose de cada lámina

## Materialización

- [x] Reclamar el evento por restricción única
- [x] Bloquear la compra y comprobar que no está materializada
- [x] Pago con su desglose completo
- [x] Envío con estado inicial y fecha estimada
- [x] Pedido de comprador con su referencia legible
- [x] Líneas del pedido
- [x] Alta del comprador como cliente, idempotente
- [x] Entrada en el libro de ingresos del comercio
- [x] Pedido operativo de almacén ~~o de tienda de mosaicos~~ — el de almacén, finalizado y con sus líneas. El de mosaicos espera a la vertical (24 y 26)
- [x] Conversión de las reservas al estado definitivo
- [x] **Marca de materialización al final de la transacción, nunca al principio**

## Corrección de importes

- [x] Total del pedido igual a lo pagado
- [x] Subtotal, envío y comisión registrados por separado
- [x] Prueba: el comprobante cuadra con el cargo

## Estados y operación

- [x] Los cuatro estados de la compra, todos alcanzables
- [x] Registro de incidencias con detalle suficiente
- [ ] Aviso a la operación ante fallo persistente — **no hay cómo contar los intentos**: la reclamación del evento se revierte con el fallo, así que `payment_events.attempts` nunca crece y «persistente» no se puede decidir. La incidencia sí queda registrada con su detalle
- [ ] Reproceso manual con ejecución única — la garantía está (`fulfilled_at` con la fila bloqueada, comprobada con dos eventos distintos); falta la **superficie** que lo dispare, que es un área de administración de plataforma que todavía no existe

## Verificación

- [x] Prueba: fallo a mitad no deja ninguna de las ocho entidades
- [x] Prueba: reenvío del evento no duplica
- [x] Prueba: sesión caducada libera el inventario
- [x] Prueba: precio manipulado no altera lo cobrado
- [ ] Prueba: mosaico sin diseño no se cobra
- [ ] Prueba: el mosaico llega completo al pedido
