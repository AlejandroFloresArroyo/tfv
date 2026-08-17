# Diseño — Compras de producción a almacenes

Modelo de datos y garantías de la única operación que escribe en dos arrendatarios a la vez.
Complementa a [`spec.md`](./spec.md).

## Lo que hace difícil esta operación

Una sola acción de un usuario de la empresa A crea filas en la empresa B y en la empresa C. Eso
choca de frente con el aislamiento entre arrendatarios de `access-control`, que exige que nadie vea
ni escriba fuera de su empresa.

La resolución: **la escritura cruzada la hace el sistema, no el usuario**. El usuario tiene permiso
para crear una orden de compra en *su* empresa; el abanico y el alta de contrapartes son
consecuencias que ejecuta el sistema con un contexto propio, auditado, y que no conceden al usuario
ningún acceso adicional.

## Tablas

```
production_purchase_order                    ← empresa de la producción
  id, production_id, company_id, type, code, category_id,
  responsible_id, delivery_address_id, status,
  cancelled_at, cancelled_by_id, cancel_reason,
  deleted_at

production_purchase_order_line
  id, purchase_order_id, measurement_id, quantity

warehouse_order                              ← empresa del almacén
  id, warehouse_id, company_id, variant, type, status, code,
  purchase_order_id nullable,                ← el vínculo entre arrendatarios
  buyer_order_id nullable,
  client_id, provider_id, quote_id nullable,
  ...
  INDEX (purchase_order_id)
```

`purchase_order_id` es una clave foránea que **cruza la frontera del arrendatario**. Es deliberada y
es la única del sistema con esa propiedad; conviene que esté documentada donde alguien la vaya a
encontrar.

## El contexto de sistema

Las políticas de aislamiento de la base filtran por las empresas del solicitante. El abanico
necesita escribir fuera de ellas.

No se resuelve usando una credencial de servicio que salte las políticas —eso desactivaría el
aislamiento para toda la operación— sino con un **contexto acotado**: la transacción declara que
opera como sistema sobre un conjunto explícito de empresas, el que resulta de los almacenes
implicados.

```
SET LOCAL app.actor_kind   = 'system';
SET LOCAL app.operation    = 'procurement_fanout';
SET LOCAL app.scope        = '{empresa_b, empresa_c}';
```

Las políticas admiten la escritura sólo para las tablas que el abanico necesita y sólo dentro de ese
conjunto. Toda operación bajo este contexto queda registrada en la bitácora de la empresa receptora
como acción del sistema — que es el requisito de trazabilidad de la spec.

## El abanico

```
BEGIN;
  -- 1. Resolver el almacén de cada línea:
  --    measurement → product → warehouse → company
  -- 2. Agrupar las líneas por almacén.
  -- 3. Por cada grupo:
  --      - contraparte cliente en la empresa del almacén   (idempotente)
  --      - contraparte proveedor en la empresa productora  (idempotente)
  --      - warehouse_order + sus líneas
  -- 4. Crear la orden de compra.
  -- 5. Bitácora en cada empresa implicada.
COMMIT;
```

Todo en una transacción. El requisito de la spec —un fallo no deja pedidos sueltos— sale gratis de
ahí.

### Idempotencia de las contrapartes

```sql
UNIQUE (company_id, counterparty_company_id, kind) WHERE deleted_at IS NULL
```

Con esa restricción, el alta se escribe como inserción con resolución de conflicto y no hace falta
comprobar antes si existe. Resuelve el requisito de que órdenes sucesivas reutilicen las
contrapartes.

## Propagación del estado

Dos direcciones, y conviene distinguirlas porque se implementan distinto:

**Hacia abajo** — cancelar la orden cancela sus pedidos. Es una escritura explícita sobre las filas
vinculadas, dentro de la misma transacción y con el contexto de sistema.

**Hacia arriba** — el último rechazo cancela la orden. Se evalúa al rechazar cada pedido:

```sql
SELECT count(*) FILTER (WHERE status <> 'cancelled') = 0
  FROM warehouse_order
 WHERE purchase_order_id = $1
   FOR UPDATE;
```

El bloqueo evita la carrera de dos almacenes rechazando a la vez y que ninguno de los dos vea al
otro como cancelado.

## La liquidación

Seis efectos en una transacción, y el orden importa porque el paso 5 depende de lo que reserve el 4:

```
BEGIN;
  SELECT * FROM warehouse_order WHERE id = $1 FOR UPDATE;
  -- rechazar si ya está liquidado → 409

  -- 1. pedido de almacén → finalizado
  -- 2. cotización → vendida
  -- 3. registrar el pago contra la cotización
  -- 4. unidades reservadas → vendidas
  -- 5. un artículo de producción por CADA UNIDAD del paso 4
  -- 6. compra en la producción, vinculada a esos artículos
COMMIT;
```

El paso 5 recorre **las unidades**, no las líneas. Una línea de tres unidades produce tres
artículos, cada uno con su propio código — es el requisito explícito de la spec y el error fácil de
cometer.

La idempotencia se apoya en `FOR UPDATE` más la comprobación del estado, no en una tabla aparte: el
propio estado del pedido es la barrera.

## Fronteras que la operación no cruza

Vale la pena enumerar lo que **no** concede este vínculo, porque es donde se cometería un error de
seguridad al implementarlo:

- El responsable de producción no obtiene lectura del catálogo completo del almacén, sólo de lo
  publicado.
- No obtiene acceso a otras cotizaciones, pedidos ni clientes de esa empresa.
- El operador del almacén no obtiene acceso a la producción, sólo al pedido que le concierne.
- Las contrapartes creadas son filas de datos, no membresías: no conceden acceso a nada.

## Decisiones abiertas

- **Alcance del contexto de sistema.** Qué tablas exactamente admiten escritura bajo él. Cuanto más
  corta sea la lista, mejor.
- **Notificación al receptor.** Hoy el almacén se entera del pedido por su bandeja. Convendría
  decidir si además se notifica activamente a la empresa receptora.
