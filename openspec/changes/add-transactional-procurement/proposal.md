# 23 · Compras entre arrendatarios

## Por qué

La integración más acoplada del sistema, y la única operación que **escribe en dos arrendatarios a
la vez**: una producción de una empresa pide equipo a los almacenes de otras, y el sistema abre un
pedido en cada una y da de alta la relación comercial en ambos sentidos.

Converge las dos columnas de trabajo: necesita la de comercio (rebanadas 12 a 15) y la de
producciones (20 a 22).

Dos problemas de fondo:

- **Ni el abanico ni la liquidación son transaccionales.** Un fallo a mitad deja pedidos sueltos en
  empresas ajenas, o una liquidación que cobró y no materializó el inventario.
- **La escritura cruzada choca con el aislamiento entre arrendatarios** de la rebanada 06. Resolver
  cómo se concilian las dos cosas es el trabajo de diseño de esta rebanada.

## Qué entra

- Orden de compra con sus líneas y su abanico a un pedido por almacén.
- Abanico atómico: o la orden y todos sus pedidos, o nada.
- Alta idempotente de las contrapartes en ambos sentidos, por restricción única.
- Contexto de sistema acotado para la escritura cruzada, auditado en la empresa receptora.
- Propagación de la cancelación hacia abajo y del rechazo hacia arriba, con bloqueo para evitar la
  carrera.
- Liquidación transaccional con sus seis efectos.
- Materialización de **un artículo por cada unidad** adquirida, no por línea.
- Compra registrada en la producción, que mueve el presupuesto sin intervención manual.
- Tienda interna que alimenta la orden.

## Correcciones incluidas

| Ref | Corrección |
|---|---|
| L-05 | El listado de órdenes deja de regenerar su código en cada llamada |

## Criterios de aceptación

- Un fallo en el abanico no deja ni la orden ni ningún pedido.
- Órdenes sucesivas entre las mismas empresas reutilizan las contrapartes.
- Sin permiso en su propia empresa, no se crea nada ni se dan de alta contrapartes.
- El alta en la empresa receptora queda registrada como operación del sistema.
- El vínculo no concede acceso a otros datos de la empresa ajena.
- Cancelar la orden cancela sus pedidos vigentes y respeta los ya liquidados.
- La liquidación produce sus seis efectos o ninguno.
- Tres unidades adquiridas producen tres artículos, cada uno con su código.
- Liquidar dos veces responde `409` sin duplicar nada.
- El código de una orden no cambia al listarla.

## Riesgos

**El paso que materializa el inventario recorre unidades, no líneas.** Es el error fácil de cometer
y produce un inventario con un artículo donde debería haber tres. Merece su propia prueba.

**El contexto de sistema es el punto donde se puede abrir un agujero de aislamiento.** Cuanto más
corta sea la lista de tablas que admiten escritura bajo él, mejor.

## Specs

`production-procurement` (con su `design.md`) · `warehouse-orders` · `clients-and-providers`
