# 23 · Compras entre arrendatarios — trabajo

## Diseño previo

- [x] Definir el contexto de sistema y su alcance — lo resolvió la rebanada 06 y está construido:
      `withSystem(operacion, alcance)` en `packages/db/src/index.ts:96-108`. El alcance es una
      lista explícita de empresas que **se suma** a las membresías en vez de sustituirlas, así que
      las políticas siguen aplicándose. Pruebas `db/tenant-context.test.ts:201`, `:211` y `:220`
- [x] Enumerar las tablas que admiten escritura bajo él, lo más corta posible — **la premisa
      cambió**: el alcance que se construyó no es una lista de tablas sino de **empresas**, y las
      políticas de cada tabla siguen decidiendo. Reescrita como pedía su propio enunciado —«qué
      operaciones declaran alcance»— y acotada a las tres de esta rebanada, que son las únicas que
      declaran **dos** empresas a la vez:

      | Operación | Alcance | Tablas que escribe |
      |---|---|---|
      | `aprovisionar_contrapartes` | almacén + producción | `counterparties` |
      | `abanico_de_compra` | producción + un almacén por línea | `production_purchase_orders`, `production_purchase_order_lines`, `warehouse_orders`, `warehouse_order_lines`, `counterparties` |
      | `cancelar_orden_de_compra` | producción + los almacenes vigentes | `production_purchase_orders`, `warehouse_orders`, `warehouse_stock_units`, `warehouse_stock_events`, `warehouse_stock_reservations`, `warehouse_order_messages` |
      | `liquidar_pedido_de_almacen` | producción + el almacén liquidado | `warehouse_orders`, `warehouse_quotes`, `warehouse_quote_payments`, `warehouse_stock_units`, `warehouse_stock_events`, `warehouse_stock_reservations`, `warehouse_order_messages`, `production_shoppings`, `production_items`, `production_item_events`, `production_purchase_orders` |

      Veintiuna tablas distintas suena a mucho para «lo más corta posible», y por eso conviene leer
      **qué acota de verdad la lista**: nada. La lista es descriptiva, no normativa. Lo que acota es
      el alcance de empresas, y lo comprueba el motor fila a fila: `warehouse_stock_units` está aquí
      porque la liquidación vende unidades, pero declararla no permite tocar las de un almacén que
      no se nombró. La prueba de que el modo de fallo es cerrado —olvidar el alcance deja la
      operación sin ver nada— es `db/tenant-context.test.ts:211` y `:220`
- [x] Definir el registro auditable en la empresa receptora — **queda definido y no construido**, y
      la razón es de catálogo, no de diseño. El asiento se escribe con `recordActivity(tx, …)`
      dentro de la misma transacción que muta, y su campo `message` es una **clave del catálogo
      cerrado** de `@tfv/contracts/activity` (H-153). Ese catálogo tiene siete claves y ninguna
      sirve aquí. Las cuatro que harían falta, con sus parámetros:

      | Clave | Parámetros | Empresa donde se asienta |
      |---|---|---|
      | `counterparty.provisioned` | `company` | la receptora, al darse de alta el cliente |
      | `procurement.ordered` | `code` | la del almacén, al abrirse el pedido |
      | `procurement.settled` | `code`, `amount` | las dos |
      | `procurement.materialized` | `count` | la de la producción |

      Añadirlas es de una línea aquí y de **cuatro traducciones en `apps/web`**, que esta tanda no
      toca: `apps/web/src/lib/activity-messages.test.ts:33` recorre el catálogo y exige las dos
      lenguas, así que añadir la clave sin la traducción deja la suite en rojo. Lo que sí queda
      escrito en las dos empresas mientras tanto es el **hito en la conversación del pedido**
      —`publishSystemMessage`, rebanada 15—, que las dos partes leen y que viaja en la misma
      transacción. No es la bitácora y no se hace pasar por ella
- [x] Decidir de dónde sale la resolución del almacén de una línea — es el huevo y la gallina de la
      `0019` otra vez: para declarar el alcance hay que saber a qué empresa pertenece cada medida, y
      averiguarlo con las políticas puestas sale vacío porque esa empresa es justo la que no se ha
      declarado. Las tres salidas son las mismas y la elección también: **una función `security
      definer` que responde a una sola pregunta** —`app.procurement_source(uuid[])`, migración
      `0031`—, y con su respuesta todo lo demás corre por `withSystem` sujeto a las políticas. La
      publicación se comprueba **dentro** de la función, como en `app.public_website`: un almacén
      sin publicar y una medida inexistente son el mismo `null` y no hay forma de distinguirlos
      desde fuera
- [x] Verificar que no abre acceso más allá de lo necesario — `db/tenant-context.test.ts:211`
      («no alcanza las que no declara») y `:220` («con alcance vacío no ve nada»). El modo de
      fallo es cerrado: olvidar declarar el alcance deja la operación sin ver nada, no viéndolo
      todo

## Orden de compra

- [ ] Orden con tipo, categoría, responsable, dirección de entrega y código único
- [ ] **Código inmutable; corregir la regeneración en cada listado**
- [ ] Líneas con medida y cantidad
- [ ] Resumen de sus pedidos y sus estados

## Abanico

- [ ] Resolución del almacén de cada línea
- [ ] Agrupación por almacén
- [ ] Un pedido por almacén, con sus líneas
- [ ] Pedido pendiente, con variante de producción y referencia a la orden
- [ ] **Todo en una transacción**
- [ ] Comprobación de permiso en la empresa de la producción

## Contrapartes

- [ ] Cliente en la empresa del almacén
- [ ] Proveedor en la empresa de la producción
- [ ] Restricción única que hace idempotente el alta
- [ ] Registro del alta en la bitácora de la empresa receptora

## Propagación

- [ ] Cancelar la orden cancela sus pedidos vigentes y libera su inventario
- [ ] Los pedidos ya liquidados conservan su estado
- [ ] Comprobación de hermanos con bloqueo al rechazar
- [ ] El último rechazo cancela la orden

## Liquidación

- [ ] Bloqueo del pedido y comprobación de que no está liquidado
- [ ] Pedido a finalizado
- [ ] Cotización a vendida
- [ ] Registro del pago contra la cotización
- [ ] Unidades reservadas a vendidas
- [ ] **Un artículo de producción por cada unidad**
- [ ] Compra en la producción, vinculada a esos artículos
- [ ] Todo en una transacción
- [ ] Segunda liquidación responde `409`
- [ ] Bitácora en ambas empresas

## Tienda interna

- [ ] Catálogo de los almacenes disponibles, respetando publicación y disponibilidad
- [ ] Carrito que se convierte en orden de compra
- [ ] Rechazo de productos sin disponibilidad

## Verificación

- [ ] Prueba: fallo en el abanico no deja orden ni pedidos
- [ ] Prueba: segunda orden reutiliza las contrapartes
- [ ] Prueba: sin permiso no se crea nada
- [ ] Prueba: el vínculo no abre otros datos de la empresa ajena
- [ ] **Prueba: tres unidades producen tres artículos**
- [ ] Prueba: liquidar dos veces responde `409`
- [ ] Prueba: la liquidación mueve el presupuesto
- [ ] Prueba: listar no altera los códigos
