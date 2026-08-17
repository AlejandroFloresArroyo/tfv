# 25 · Cobro del mostrador en el servidor

## Por qué

Hoy **toda la ruta de escritura del punto de venta vive en el navegador** (`DEFECTS.md` M-06). El
navegador calcula los totales y encadena por su cuenta la creación de la venta y de cada uno de sus
movimientos de inventario, con llamadas sueltas, sin transacción y sin que el servidor valide ni los
importes ni las existencias.

Un mosaico de seis láminas genera del orden de treinta escrituras encadenadas desde el navegador.
Si el cajero cierra la pestaña a mitad, queda una venta con parte de su inventario descontado.

Y el importe cobrado es el que el navegador diga.

## Qué entra

- Cálculo del importe en el servidor, con los precios de la definición de inventario de esa tienda.
- Cobro como **una sola transacción** que crea la venta y todos sus movimientos.
- Validación de existencia antes de registrar.
- Sesión de caja: apertura con fondo, una sola activa por tienda, cierre con conteo y cuadre.
- Sólo el efectivo interviene en el efectivo esperado.
- Medios de pago, incluido el mixto, con importe recibido y cambio.
- Recibo e instructivo de armado.
- Anulación que genera compensaciones y descuenta de los totales de la sesión.

## Criterios de aceptación

- Un total enviado por el navegador que no corresponda se descarta.
- Un cobro que falla a mitad no deja ni la venta ni ningún movimiento.
- Cobrar un mosaico de seis láminas produce su estructura completa de movimientos.
- Existencia insuficiente rechaza el cobro indicando qué falta.
- Una tienda no admite dos sesiones activas.
- Una sesión cerrada no admite ventas ni se reabre.
- Cerrar sin conteo se rechaza.
- Una venta con tarjeta no altera el efectivo esperado, pero sí el total de la sesión.
- El importe recibido en efectivo no puede ser menor que el total.
- Anular una venta descuenta su importe del total de la sesión.

## Riesgos

**El cajero trabaja con un cliente delante.** Mover el cobro al servidor introduce una dependencia
de red donde antes había trabajo local. Hay que decidir qué ocurre si la conexión falla a mitad del
cobro: reintento idempotente con clave de operación es el camino, y conviene resolverlo antes de
implementar y no después de la primera queja.

## Specs

`pixit-point-of-sale` · `pixit-inventory-ledger`
