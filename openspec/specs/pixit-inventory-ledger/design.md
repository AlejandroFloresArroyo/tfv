# Diseño — Inventario de Pixit

Modelo de datos del libro mayor de inventario. Complementa a [`spec.md`](./spec.md).

## Dos modelos de inventario en la misma plataforma

Conviene tenerlo presente porque invita a confusión:

| | Almacenes | Pixit |
|---|---|---|
| Unidad | Una fila = un objeto físico | Una fila = un movimiento |
| Existencia | Recuento por estado | Suma de cantidades |
| Historial | Eventos de cambio de estado | El propio libro |
| Se reserva | Sí, unidades concretas | No |

Ambos son correctos para su dominio. Una cámara se identifica; un ladrillo rojo no.

## Tablas

```
pixit_inventory_definition                   ← qué maneja la tienda y a qué precio
  id, store_id, kind,                        ← 'board_size' | 'sheet' | 'brick'
  catalog_ref_id,                            ← al tamaño, lámina o color del catálogo
  price, image_id, slug, low_stock_threshold,
  deleted_at
  UNIQUE (store_id, kind, catalog_ref_id) WHERE deleted_at IS NULL

pixit_inventory_movement                     ← el libro. Sólo se anexa.
  id, definition_id, quantity,               ← positivo entrada, negativo salida
  pieces nullable,                           ← sólo ladrillos: doble unidad
  sale_id nullable,
  parent_movement_id nullable,               ← lámina → tablero, ladrillo → lámina
  position nullable,                         ← orden de la lámina en el tablero
  image_id nullable,                         ← imagen generada de la lámina
  compensates_movement_id nullable,          ← asiento de anulación
  authorized_negative boolean,
  actor_id, occurred_at
  INDEX (definition_id) INCLUDE (quantity)
  INDEX (sale_id)
  INDEX (parent_movement_id, position)
```

### Una tabla de definiciones con discriminador, no tres

Las tres —tamaños, láminas y colores— tienen exactamente los mismos campos y el mismo
comportamiento. Tres tablas idénticas obligarían a triplicar cada consulta de existencia, cada
verificación y cada vista.

El discriminador `kind` con `catalog_ref_id` cuesta perder la clave foránea tipada hacia el
catálogo. Se compensa con una restricción de comprobación que valida la correspondencia entre
`kind` y la tabla de destino, y con vistas por tipo para las consultas frecuentes.

Lo mismo aplica a los movimientos: una sola tabla, y `parent_movement_id` referenciándose a sí misma
construye el árbol tablero → lámina → ladrillo.

## Inmutabilidad

El libro es de sólo anexado. No se garantiza sólo por convención de código:

```sql
REVOKE UPDATE, DELETE ON pixit_inventory_movement FROM application_role;
```

Corregir un error es registrar un asiento compensatorio, igual que en contabilidad. Es lo que exige
el requisito de anulación de la spec, y la razón por la que borrar los movimientos —lo que hace hoy
la anulación de una venta— destruye información irrecuperable.

## La existencia

```sql
CREATE VIEW pixit_inventory_stock AS
SELECT definition_id,
       COALESCE(SUM(quantity), 0) AS quantity,
       COALESCE(SUM(pieces), 0)   AS pieces
  FROM pixit_inventory_movement
 GROUP BY definition_id;
```

Una vista bastará durante mucho tiempo: el índice cubre la agregación y el número de movimientos por
definición crece despacio.

Si algún día no bastara, el camino es una tabla de saldos mantenida por disparador, **no** un
contador que la aplicación actualice: eso reintroduce exactamente la posibilidad de desincronización
que el libro evita.

## La doble unidad de los ladrillos

`quantity` son bolsas y `pieces` son piezas. Ambas con el mismo signo — lo garantiza una restricción
de comprobación:

```sql
CHECK (pieces IS NULL OR sign(quantity) = sign(pieces))
CHECK ((kind = 'brick') = (pieces IS NOT NULL))
```

Las piezas por bolsa son **configuración por tienda**, no una constante. Hoy es un `6` escrito en el
código del navegador; sacarlo de ahí es requisito de la spec.

## El árbol de un mosaico vendido

Los movimientos hacen doble trabajo: llevan el saldo **y** describen la estructura de lo vendido.

```
movimiento de tablero  (sale_id, quantity −1)
  └── movimiento de lámina  (parent_movement_id, position 0..n, image_id)
        └── movimiento de ladrillo  (parent_movement_id, quantity −bolsas, pieces −piezas)
```

Esa jerarquía es lo que recorre el instructivo de armado. Es un uso poco habitual de una tabla de
movimientos y conviene documentarlo: sin él, alguien podría "simplificar" el modelo separando la
estructura del mosaico en tablas propias y duplicaría la información.

## Anulación

```
BEGIN;
  SELECT * FROM pixit_inventory_movement WHERE sale_id = $1 FOR UPDATE;
  -- insertar, por cada uno, su compensatorio con signo contrario
  -- y compensates_movement_id apuntando al original
  UPDATE pixit_sale SET voided_at = now() WHERE id = $1;
COMMIT;
```

Un movimiento SHALL compensarse como máximo una vez:

```sql
UNIQUE (compensates_movement_id) WHERE compensates_movement_id IS NOT NULL
```

Esa restricción hace que anular dos veces sea imposible a nivel de base, no sólo improbable.

## Existencia negativa

Se permite con autorización explícita y queda marcada con `authorized_negative`. No se impide por
restricción, porque en el mostrador la realidad a veces va por delante del sistema: es preferible
registrar la venta y señalar el descuadre que bloquear al cajero con un cliente delante.

La consulta de incidencias localiza las definiciones con saldo negativo y los movimientos que lo
provocaron.

## Decisiones abiertas

- **F-10 — anulación.** La spec asume compensación. Está pendiente de confirmar, aunque la
  alternativa —borrar— es incompatible con un libro mayor.
- **Piezas por bolsa.** Se asume configuración por tienda. Si resultara ser un atributo del color
  (bolsas de distinto tamaño según el ladrillo), va en la definición y no en la tienda.
- **Cierre de periodo.** No existe. Si el volumen crece, un saldo de apertura por periodo evitaría
  agregar el libro entero.
