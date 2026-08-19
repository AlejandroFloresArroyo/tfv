# 15 · Pedidos de almacén — trabajo

## Modelo

- [x] Pedido con su variante de origen, tipo, estado y código único
- [x] Referencias al pedido de comprador o a la orden de compra que lo originó
- [x] Líneas con medida, cantidad y orden de presentación
- [ ] Referencia a unidades concretas cuando el origen ya las determinó — **ya no espera a nadie**:
      el escaparate llegó y aparta unidades concretas, pero la línea del pedido operativo se
      escribe con medida y cantidad y sin unidad (`apps/api/src/checkout/fulfillment.ts:377-387`).
      Es trabajo que se puede hacer hoy
- [x] Prioridad como valor calculado a partir del estado

## Ciclo de vida

- [x] Transiciones permitidas; el resto responde `409`
- [x] Estados cerrados no vuelven a abrirse
- [x] Orden por prioridad descendente en los listados

## Aceptación

- [x] Creación atómica de pedido aceptado, cotización y reservas
- [x] Folio de la cotización derivado del código del pedido
- [x] Filtrado por defecto de las líneas sin existencia suficiente
- [x] Informe de las líneas que quedaron fuera y por qué
- [x] Inclusión de todas con autorización explícita de creación de inventario
- [x] Rechazo de la segunda aceptación

## Rechazo y cancelación

- [x] Motivo obligatorio, con autor e instante
- [x] Comprobación de hermanos con bloqueo, para evitar la carrera
- [x] Cancelación de la orden de compra al rechazarse el último
- [ ] Cancelación descendente desde la orden de compra — espera al servicio de producciones
- [x] Liberación del inventario apartado al cancelar

## Compra pública

- [x] Pedido que nace finalizado, sin aceptación ni cotización — lo crea la materialización de la
      compra pública con `status: "finished"` y `origin: "storefront"`, sin pasar por aceptación
      ni por cotización (`apps/api/src/checkout/fulfillment.ts:364-374`). Prueba
      `checkout/checkout.test.ts:736`, punto 7 de las ocho entidades
- [ ] Unidades en el estado que corresponda a la modalidad — **implementada, media prueba**: la
      liquidación pone `sold` o `rented` según la modalidad
      (`apps/api/src/checkout/reservations.ts:218`), y sólo la venta está probada
      (`checkout/checkout.test.ts:806-817`). De la renta no hay ninguna prueba, y es la rama que
      además conserva la reserva viva en vez de soltarla

## Correcciones de lectura

> Se cumplen por construcción: cada listado consulta su propia tabla y devuelve su propia forma.
> La pila anterior devolvía registros de envío desde cuatro lecturas distintas.

- [x] Las lecturas de pedidos devuelven pedidos
- [x] Las lecturas de pagos devuelven pagos
- [x] Las lecturas de compras devuelven compras
- [x] Las lecturas de pedidos web devuelven pedidos web

## Otros

- [x] Contador de mensajes sin leer, por parte
- [x] Eliminación con comprobación de equipo sin devolver
- [x] Búsqueda y filtrado

## Verificación

- [x] Prueba: aceptación atómica; el fallo no deja pedido aceptado ni cotización
- [x] Prueba: aceptar dos veces responde `409`
- [x] Prueba: el último rechazo cancela la orden de compra
- [x] Prueba: un rechazo parcial no la cancela
- [x] Prueba: el contador de no leídos difiere por parte
