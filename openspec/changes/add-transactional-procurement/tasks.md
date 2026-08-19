# 23 · Compras entre arrendatarios — trabajo

## Diseño previo

- [x] Definir el contexto de sistema y su alcance — lo resolvió la rebanada 06 y está construido:
      `withSystem(operacion, alcance)` en `packages/db/src/index.ts:96-108`. El alcance es una
      lista explícita de empresas que **se suma** a las membresías en vez de sustituirlas, así que
      las políticas siguen aplicándose. Pruebas `db/tenant-context.test.ts:201`, `:211` y `:220`
- [ ] Enumerar las tablas que admiten escritura bajo él, lo más corta posible — **la premisa
      cambió**: el alcance que se construyó no es una lista de tablas sino de **empresas**, y las
      políticas de cada tabla siguen decidiendo. La lista corta que esta tarea pedía habría que
      reescribirla como «qué operaciones declaran alcance», que es lo que hoy dice el nombre del
      primer argumento en cada una de las quince llamadas
- [ ] Definir el registro auditable en la empresa receptora
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
