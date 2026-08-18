# 15 · Pedidos de almacén — trabajo

## Modelo

- [x] Pedido con su variante de origen, tipo, estado y código único
- [x] Referencias al pedido de comprador o a la orden de compra que lo originó
- [x] Líneas con medida, cantidad y orden de presentación
- [ ] Referencia a unidades concretas cuando el origen ya las determinó — espera al escaparate
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

- [ ] Pedido que nace finalizado, sin aceptación ni cotización — espera al escaparate
- [ ] Unidades en el estado que corresponda a la modalidad — espera al escaparate

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
