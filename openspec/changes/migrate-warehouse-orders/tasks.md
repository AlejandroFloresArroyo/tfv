# 15 · Pedidos de almacén — trabajo

## Modelo

- [ ] Pedido con su variante de origen, tipo, estado y código único
- [ ] Referencias al pedido de comprador o a la orden de compra que lo originó
- [ ] Líneas con medida, cantidad y orden de presentación
- [ ] Referencia a unidades concretas cuando el origen ya las determinó
- [ ] Prioridad como valor calculado a partir del estado

## Ciclo de vida

- [ ] Transiciones permitidas; el resto responde `409`
- [ ] Estados cerrados no vuelven a abrirse
- [ ] Orden por prioridad descendente en los listados

## Aceptación

- [ ] Creación atómica de pedido aceptado, cotización y reservas
- [ ] Folio de la cotización derivado del código del pedido
- [ ] Filtrado por defecto de las líneas sin existencia suficiente
- [ ] Informe de las líneas que quedaron fuera y por qué
- [ ] Inclusión de todas con autorización explícita de creación de inventario
- [ ] Rechazo de la segunda aceptación

## Rechazo y cancelación

- [ ] Motivo obligatorio, con autor e instante
- [ ] Comprobación de hermanos con bloqueo, para evitar la carrera
- [ ] Cancelación de la orden de compra al rechazarse el último
- [ ] Cancelación descendente desde la orden de compra
- [ ] Liberación del inventario apartado al cancelar

## Compra pública

- [ ] Pedido que nace finalizado, sin aceptación ni cotización
- [ ] Unidades en el estado que corresponda a la modalidad

## Correcciones de lectura

- [ ] Las lecturas de pedidos devuelven pedidos
- [ ] Las lecturas de pagos devuelven pagos
- [ ] Las lecturas de compras devuelven compras
- [ ] Las lecturas de pedidos web devuelven pedidos web

## Otros

- [ ] Contador de mensajes sin leer, por parte
- [ ] Eliminación con comprobación de equipo sin devolver
- [ ] Búsqueda y filtrado

## Verificación

- [ ] Prueba: aceptación atómica; el fallo no deja pedido aceptado ni cotización
- [ ] Prueba: aceptar dos veces responde `409`
- [ ] Prueba: el último rechazo cancela la orden de compra
- [ ] Prueba: un rechazo parcial no la cancela
- [ ] Prueba: el contador de no leídos difiere por parte
