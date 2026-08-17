# 18 · Compra y materialización transaccionales

## Por qué

Donde una compra pública se convierte en dinero cobrado y en trabajo para el almacén. Concentra tres
de los defectos más caros del sistema:

| Ref | Problema |
|---|---|
| M-10 | Las existencias se **seleccionan sin marcarse**, así que dos compradores pueden pagar por la misma unidad. Y los checkouts pendientes **no caducan nunca** |
| M-02 | La materialización crea ocho entidades **sin transacción**, y una de sus ramas crea los hijos fuera del ciclo de vida, tragándose los errores |
| M-03 | El proceso **no es idempotente**: la única guarda se marca antes de hacer el trabajo, así que un reintento del procesador duplica pedidos y pagos |
| M-01 | El total del pedido se fija igual al subtotal, ignorando el envío: el comprobante del comprador no cuadra con el cargo |

Depende de la rebanada 07, que garantiza que el evento que dispara la materialización es legítimo y
se procesa una sola vez.

## Qué entra

- Validación de existencia y **reserva efectiva** al crear la sesión de pago, con caducidad.
- Liberación de la reserva al caducar o al cancelar.
- Resolución de precios en el servidor; los del navegador se descartan.
- Instantánea completa de la compra, que es la fuente de la materialización.
- Materialización atómica de las ocho entidades.
- Ejecución única garantizada por dos barreras independientes.
- Total del pedido igual a lo pagado, con subtotal, envío y comisión registrados por separado.
- Subida del diseño del mosaico **antes** de crear la sesión de pago.
- Incidencias visibles y reproceso manual.

## Correcciones incluidas

Además de M-01, M-02, M-03 y M-10: **F-08**, el diseño del mosaico que hoy se pierde entre el
carrito y el pedido porque su subida está comentada.

## Criterios de aceptación

- Dos compradores sobre una única unidad: exactamente uno obtiene su sesión.
- Una sesión caducada libera las unidades apartadas.
- Un precio manipulado en el carrito no altera lo cobrado.
- Un fallo a mitad de la materialización no deja pago, envío, pedido ni movimientos.
- Reenviar el evento no crea un segundo pedido.
- El total del pedido coincide con el importe cargado al comprador.
- Un mosaico sin diseño conservado no se cobra.
- Los cuatro estados de una compra son alcanzables.
- Un administrador de plataforma puede reprocesar una incidencia sin duplicar.

## Riesgos

**El orden de la marca de materialización es el detalle que arruina todo lo demás si se equivoca.**
Debe confirmarse al final de la transacción, nunca al principio: marcarla antes es exactamente lo
que hace hoy que un fallo deje una compra marcada como resuelta y sin pedido, irreparable por
reintento.

## Specs

`storefront-checkout` · `order-fulfillment` (con su `design.md`) · `payment-webhooks`
