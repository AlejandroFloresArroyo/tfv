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

- [x] Orden con tipo, categoría, responsable, dirección de entrega y código único — las tres
      referencias se comprueban contra **la empresa de la producción** y no contra el alcance, que
      bajo `withSystem` incluye a las ajenas
- [x] **Código inmutable; corregir la regeneración en cada listado** — se escribe una vez, al
      crear. Prueba «listar el conjunto varias veces no lo altera», que además compara lo leído con
      lo guardado: no hay reescritura silenciosa (`DEFECTS.md` L-05)
- [x] Líneas con medida y cantidad, y con el pedido en el que acabaron
- [x] Resumen de sus pedidos y sus estados — **sin nombres de la empresa ajena**: identificador de
      almacén, código, estado, cotización y cuántas líneas. El nombre lo tiene la pantalla porque lo
      vio en la tienda interna. Ver `HALLAZGOS.md` H-282

## Abanico

- [x] Resolución del almacén de cada línea — `app.procurement_source`, `security definer`,
      migración `0031`. Es el huevo y la gallina de la `0019`: el alcance no se puede declarar
      porque las empresas son justo lo que se está averiguando
- [x] Agrupación por almacén, en el orden de la primera línea que lo nombra — reproducible
- [x] Un pedido por almacén, con sus líneas
- [x] Pedido pendiente, con variante de producción y referencia a la orden
- [x] **Todo en una transacción** — y comprobado por mutación: partiendo el `withSystem` en dos,
      la prueba de atomicidad falla nombrando la orden que quedó suelta
- [x] Comprobación de permiso en la empresa de la producción — en el guardián, antes del
      manejador, y **además** como solicitante antes de ensanchar el alcance (`assertProduction`)

## Contrapartes

- [x] Cliente en la empresa del almacén — y es lo que deja a la producción **leer** su pedido y su
      cotización allí: `app.is_my_counterparty(client_id)` es la vía de lectura
- [x] Proveedor en la empresa de la producción — y es el que la liquidación pone en la compra, así
      que el gasto queda con su proveedor sin que nadie lo elija
- [x] Restricción única que hace idempotente el alta — ya existía; lo que se añadió es
      `provisionPairIn`, que corre **dentro** de la transacción del abanico. Con la versión que
      abría la suya, un abanico revertido dejaba a dos empresas figurando como socias
- [ ] Registro del alta en la bitácora de la empresa receptora — **no se puede sin tocar
      `apps/web`**: la bitácora va por clave de catálogo cerrado y ninguna de las siete sirve;
      añadir una exige sus dos traducciones o la suite se cae. Las claves que harían falta están
      nombradas arriba, en «Diseño previo». `HALLAZGOS.md` H-281

## Propagación

- [x] Cancelar la orden cancela sus pedidos vigentes y libera su inventario
- [x] Los pedidos ya liquidados conservan su estado
- [x] Comprobación de hermanos con bloqueo al rechazar — era de la rebanada 15 y **nunca funcionó
      entre empresas**: la escritura caía en la empresa de la producción y afectaba a cero filas en
      silencio. Corregido aquí. `HALLAZGOS.md` H-280
- [x] El último rechazo cancela la orden

## Liquidación

- [x] Bloqueo del pedido y comprobación de que no está liquidado, con un índice único parcial
      debajo por si dos peticiones entran a la vez
- [x] Pedido a finalizado — desde «aceptado», que la máquina de estados no prevé. No es un cambio
      de estado suelto sino el cierre del circuito. `HALLAZGOS.md` H-284
- [x] Cotización a vendida — con `sellQuote`, extraída de `changeQuoteStatus` para no copiar la
      congelación de la composición, que es donde dos copias divergen
- [x] Registro del pago contra la cotización — **sin contrastarlo con lo que la cotización dice
      que cuesta**, y eso queda anotado en `HALLAZGOS.md` H-288
- [x] Unidades reservadas a vendidas
- [x] **Un artículo de producción por cada unidad** — con su propio código, heredando nombre,
      descripción e imágenes, y con su evento de alta firmado sin estado de origen
- [x] Compra en la producción, vinculada a esos artículos
- [x] Todo en una transacción
- [x] Segunda liquidación responde `409`
- [ ] Bitácora en ambas empresas — **a medias y dicho**: el hito queda escrito en la conversación
      del pedido, que las dos partes leen y que viaja en la misma transacción. El asiento de
      bitácora no, por lo mismo que el alta de la contraparte. `HALLAZGOS.md` H-281

## Tienda interna

- [x] Catálogo de los almacenes disponibles, respetando publicación y disponibilidad — dos
      lecturas: el escaparate y el catálogo de un almacén. La publicación se comprueba dentro de
      `app.published_warehouses`, así que pedir un almacén sin publicar por su identificador
      responde `404`. La consecuencia —no se puede comprar a un almacén sin publicar— está anotada
      en `HALLAZGOS.md` H-283
- [ ] Carrito que se convierte en orden de compra — **el carrito es interfaz y va en la 29c**. Lo
      que le hace falta está: el escaparate del que se compone y la ruta que lo recibe entero y lo
      convierte en la orden con su abanico
- [x] Rechazo de productos sin disponibilidad — y de los que no se ofrecen en la modalidad de la
      orden. Se comprueba por almacén, dentro de la transacción, que es la primera vez que se puede
      mirar: es además el fallo que ejerce la prueba de atomicidad

## Verificación

- [x] Prueba: fallo en el abanico no deja orden ni pedidos
- [x] Prueba: segunda orden reutiliza las contrapartes
- [x] Prueba: sin permiso no se crea nada — ni orden, ni pedidos, ni contrapartes
- [x] Prueba: el vínculo no abre otros datos de la empresa ajena — cinco caminos de la empresa del
      almacén, los cinco `404` con el pedido abierto
- [x] **Prueba: tres unidades producen tres artículos**, cada uno con su propio código
- [x] Prueba: liquidar dos veces responde `409`, sin duplicar artículos, compras ni pagos
- [x] Prueba: la liquidación mueve el presupuesto — de `0.00` a `12500.00` sin que nadie registre
      nada a mano
- [x] Prueba: listar no altera los códigos
