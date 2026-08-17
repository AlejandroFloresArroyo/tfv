# 15 · Pedidos de almacén

## Por qué

El ciclo de trabajo del operador del almacén. Depende de las rebanadas 13 y 14 porque su transición
central —aceptar— crea una cotización con inventario ya apartado.

Reimplementación con un cambio de fondo: **aceptar un pedido pasa a ser atómico**. Hoy crea la
cotización, reserva el inventario y enlaza el pedido en pasos sueltos, así que un fallo puede dejar
un pedido aceptado sin cotización, o una cotización con reservas y sin pedido que la referencie.

## Qué entra

- Ciclo de vida completo con sus transiciones permitidas.
- Prioridad derivada del estado, como valor calculado y no escrito por la aplicación.
- Aceptación atómica que genera la cotización con sus líneas y sus reservas.
- Comportamiento ante existencia insuficiente al aceptar: informar de lo que queda fuera, o incluir
  todo con autorización explícita.
- Rechazo con motivo obligatorio y atribución.
- Propagación del rechazo hacia la orden de compra cuando todos los hermanos quedan cancelados.
- Propagación de la cancelación desde la orden de compra hacia sus pedidos.
- Pedidos de compra pública, que nacen resueltos.
- Indicador de mensajes sin leer por parte.

## Correcciones incluidas

| Ref | Corrección |
|---|---|
| C-01 · C-02 · C-03 · C-04 | Las lecturas de pedidos, pagos, compras y pedidos web devuelven la entidad que anuncian, no registros de envío |

## Criterios de aceptación

- Aceptar produce pedido aceptado, cotización en progreso y unidades apartadas, o nada.
- Aceptar dos veces responde `409` y no crea una segunda cotización.
- Rechazar sin motivo se rechaza.
- El último rechazo de una orden de compra la cancela; un rechazo parcial no.
- Cancelar la orden de compra cancela sus pedidos y libera su inventario.
- Un pedido cancelado o finalizado no vuelve a un estado abierto.
- Un pedido de compra pública nace finalizado, sin cotización.
- El contador de mensajes sin leer es distinto para cada parte.

## Specs

`warehouse-orders` · `quotations`
