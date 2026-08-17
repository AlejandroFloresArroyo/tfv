# Compras de producción a almacenes

## Purpose

La integración más acoplada de la plataforma: una producción de una empresa consigue equipo de los
almacenes de **otras empresas**, dentro del mismo sistema.

El movimiento central es un **abanico**. El responsable de producción arma una sola solicitud con
todo lo que necesita, sin preocuparse de a quién pertenece cada cosa. El sistema resuelve de qué
almacén es cada artículo y **abre un pedido por almacén**, cada uno en la empresa que corresponde.

```
Orden de compra de producción        (empresa A)
   ├── Pedido de almacén  → almacén 1 (empresa B)
   ├── Pedido de almacén  → almacén 2 (empresa C)
   └── Pedido de almacén  → almacén 3 (empresa B)
```

Al hacerlo, el sistema **da de alta la relación comercial en ambos sentidos**: la empresa A pasa a
ser cliente de B y de C, y B y C pasan a ser proveedores de A. Nadie tiene que darlas de alta a
mano.

La otra mitad es la **liquidación**: cuando la producción acepta la cotización de un almacén y paga,
el equipo comprado se materializa como artículos del inventario de la producción —uno por unidad— y
se registra el gasto, que mueve el presupuesto solo.

Es la única operación del sistema que **escribe en dos arrendatarios a la vez**, y por eso su
atomicidad y su control de acceso merecen requisitos propios.

## Requirements

### Requirement: Orden de compra de una producción

Una producción SHALL poder registrar órdenes de compra, cada una con su nombre, su tipo —renta o
venta—, su categoría, su responsable, la dirección de entrega y un código identificativo único.

Una orden SHALL registrar las líneas solicitadas, cada una referenciando una medida de producto de
un almacén con su cantidad.

#### Scenario: Se crea una orden con líneas de varios almacenes

- **WHEN** se crea una orden con líneas de tres almacenes distintos
- **THEN** queda registrada con todas sus líneas

### Requirement: El abanico ocurre al crear la orden

Al crear una orden de compra, el sistema SHALL resolver a qué almacén pertenece cada línea y SHALL
crear **un pedido de almacén por cada almacén implicado**, con las líneas que le corresponden.

Cada pedido SHALL nacer pendiente, con variante de producción y con la referencia a la orden que lo
originó.

#### Scenario: Tres almacenes producen tres pedidos

- **GIVEN** una orden con seis líneas repartidas entre tres almacenes
- **WHEN** se crea
- **THEN** existen tres pedidos de almacén, uno por almacén
- **AND** cada uno contiene únicamente sus líneas

#### Scenario: Dos líneas del mismo almacén van juntas

- **GIVEN** una orden con dos líneas del mismo almacén
- **WHEN** se crea
- **THEN** existe un solo pedido para ese almacén, con las dos líneas

#### Scenario: El pedido conoce su origen

- **WHEN** se crea la orden
- **THEN** cada pedido resultante referencia la orden de compra que lo originó

### Requirement: El abanico es atómico

La creación de la orden y de todos sus pedidos SHALL confirmarse de forma atómica.

Si falla la creación de cualquiera de los pedidos, no SHALL quedar ni la orden ni ningún pedido.

#### Scenario: Un fallo no deja pedidos sueltos

- **GIVEN** una orden con líneas de tres almacenes
- **WHEN** falla la creación del tercer pedido
- **THEN** no existe la orden
- **AND** no existe ninguno de los tres pedidos

### Requirement: El alta comercial ocurre en ambos sentidos

Al abrir un pedido en el almacén de otra empresa, el sistema SHALL registrar la relación comercial
en las dos direcciones, conforme a `clients-and-providers`:

- en la empresa del almacén, un **cliente** que representa a la empresa de la producción;
- en la empresa de la producción, un **proveedor** que representa a la empresa del almacén.

El alta SHALL ser idempotente: órdenes sucesivas SHALL reutilizar las contrapartes existentes.

#### Scenario: La primera compra crea las dos contrapartes

- **GIVEN** dos empresas que nunca han comerciado entre sí
- **WHEN** una producción de la primera abre un pedido en un almacén de la segunda
- **THEN** la segunda tiene un cliente que representa a la primera
- **AND** la primera tiene un proveedor que representa a la segunda

#### Scenario: Una segunda compra no duplica

- **GIVEN** la relación ya establecida
- **WHEN** se abre otro pedido entre las mismas empresas
- **THEN** se reutilizan las contrapartes existentes

### Requirement: El alta entre empresas requiere autorización

Abrir un pedido en el almacén de otra empresa SHALL exigir que quien lo hace tenga el permiso
correspondiente en la empresa de la producción.

El alta automática de la contraparte en la empresa del almacén SHALL realizarse como operación del
sistema, y SHALL quedar registrada como tal en la bitácora de esa empresa.

Ningún principal SHALL obtener por esta vía acceso de lectura o escritura a datos de la otra empresa
más allá del pedido que las vincula.

#### Scenario: Sin permiso no se abre el pedido

- **GIVEN** un miembro sin permiso de crear órdenes de compra
- **WHEN** intenta crear una
- **THEN** la respuesta es `403`
- **AND** no se crea ninguna contraparte

#### Scenario: El alta queda registrada en la empresa receptora

- **WHEN** se abre un pedido en el almacén de otra empresa
- **THEN** la bitácora de esa empresa registra el alta del cliente como operación del sistema

#### Scenario: El vínculo no abre otros datos

- **GIVEN** una producción con un pedido abierto en el almacén de otra empresa
- **WHEN** su responsable intenta consultar otros datos de esa empresa
- **THEN** la respuesta es `404`

### Requirement: Cada almacén responde por su cuenta

Cada pedido derivado de una orden SHALL seguir su propio ciclo de vida, conforme a
`warehouse-orders`, con independencia de lo que hagan los demás.

#### Scenario: Un almacén acepta y otro rechaza

- **GIVEN** una orden con pedidos en dos almacenes
- **WHEN** uno acepta y el otro rechaza
- **THEN** el primero continúa hacia su cotización
- **AND** el segundo queda cancelado
- **AND** la orden sigue vigente

### Requirement: El rechazo total cancela la orden

Cuando **todos** los pedidos de una orden de compra queden cancelados, la orden SHALL cancelarse
automáticamente indicando que todos sus pedidos fueron rechazados.

#### Scenario: El último rechazo cierra la orden

- **GIVEN** una orden con tres pedidos, dos ya cancelados
- **WHEN** se rechaza el tercero
- **THEN** la orden queda cancelada con el motivo correspondiente

### Requirement: Cancelar la orden cancela sus pedidos

Cancelar o eliminar una orden de compra SHALL cancelar todos sus pedidos vigentes, registrar el
motivo y liberar el inventario que tuvieran apartado.

La operación SHALL ser atómica y SHALL alcanzar a todas las empresas implicadas.

#### Scenario: La cancelación llega a todos los almacenes

- **GIVEN** una orden con pedidos aceptados en tres almacenes de dos empresas
- **WHEN** la producción cancela la orden
- **THEN** los tres pedidos quedan cancelados
- **AND** el inventario apartado en los tres se libera

#### Scenario: Un pedido ya liquidado no se cancela

- **GIVEN** una orden con un pedido ya liquidado y otro pendiente
- **WHEN** se cancela la orden
- **THEN** el pendiente se cancela
- **AND** el liquidado conserva su estado

### Requirement: La liquidación cierra el circuito

El sistema SHALL permitir liquidar un pedido de almacén aceptado, indicando el importe pagado, el
método y los comprobantes.

La liquidación SHALL, en una sola transacción:

1. marcar el pedido de almacén como finalizado;
2. cerrar su cotización como vendida;
3. registrar el pago contra esa cotización;
4. pasar a vendidas todas las unidades reservadas;
5. materializar en el inventario de la producción **un artículo por cada unidad** adquirida;
6. registrar la compra correspondiente en la producción, vinculada a esos artículos.

#### Scenario: La liquidación materializa el inventario

- **GIVEN** un pedido aceptado cuya cotización reserva cuatro unidades
- **WHEN** se liquida
- **THEN** el pedido queda finalizado y su cotización vendida
- **AND** las cuatro unidades del almacén quedan vendidas
- **AND** la producción tiene cuatro artículos nuevos en su inventario
- **AND** existe una compra por el importe pagado, vinculada a esos artículos

#### Scenario: Un fallo no liquida a medias

- **GIVEN** una liquidación que falla al materializar los artículos
- **WHEN** se revierte
- **THEN** el pedido sigue aceptado
- **AND** la cotización no está vendida
- **AND** las unidades siguen reservadas
- **AND** no hay artículos ni compra nuevos

### Requirement: Un artículo por cada unidad adquirida

La materialización SHALL crear un artículo por **cada unidad física** adquirida, no uno por línea.

Cada artículo SHALL heredar el nombre, la descripción y las imágenes del producto de origen, SHALL
recibir su propio código identificativo y SHALL nacer disponible.

#### Scenario: Tres unidades producen tres artículos

- **GIVEN** una línea de tres unidades del mismo producto
- **WHEN** se liquida
- **THEN** se crean tres artículos, cada uno con su propio código

#### Scenario: Los artículos heredan la descripción

- **WHEN** se materializa un artículo desde un producto de almacén
- **THEN** conserva su nombre, su descripción y sus imágenes
- **AND** su estado inicial es disponible

### Requirement: La liquidación mueve el presupuesto

La compra generada por una liquidación SHALL registrarse con el importe pagado y con el proveedor
correspondiente, de modo que el presupuesto de la producción lo refleje sin intervención manual.

#### Scenario: El gasto aparece solo en el presupuesto

- **GIVEN** un presupuesto de producción con un gasto determinado
- **WHEN** se liquida una compra a un almacén
- **THEN** el gasto aumenta en el importe liquidado
- **AND** nadie ha tenido que registrarlo a mano

### Requirement: La liquidación es idempotente

Liquidar un pedido ya liquidado SHALL rechazarse con `409`, sin duplicar artículos, compras ni
pagos.

#### Scenario: No se liquida dos veces

- **GIVEN** un pedido ya liquidado
- **WHEN** se intenta liquidar de nuevo
- **THEN** la respuesta es `409`
- **AND** no se crean artículos ni compras adicionales

### Requirement: La liquidación deja constancia en ambas empresas

La liquidación SHALL registrar actividad en la empresa de la producción y en la del almacén, cada
una con lo que le concierne.

#### Scenario: Ambas partes ven el cierre

- **WHEN** se liquida una compra
- **THEN** la bitácora de la producción registra la compra y los artículos incorporados
- **AND** la bitácora del almacén registra el cierre de su pedido y de su cotización

### Requirement: La tienda interna alimenta la orden

El sistema SHALL ofrecer a la producción una superficie de catálogo donde consultar los productos
publicados de los almacenes disponibles, componer un carrito y convertirlo en una orden de compra.

El catálogo SHALL respetar la disponibilidad y la modalidad de cada producto.

#### Scenario: El carrito se convierte en orden

- **GIVEN** un carrito con artículos de dos almacenes
- **WHEN** se confirma
- **THEN** se crea una orden de compra
- **AND** el abanico produce un pedido por almacén

#### Scenario: Un producto sin disponibilidad no se añade

- **GIVEN** un producto sin unidades disponibles
- **WHEN** se intenta añadir al carrito
- **THEN** la acción se rechaza

### Requirement: Consulta del estado de una orden

Una orden de compra SHALL exponer cuántos pedidos generó y el estado de cada uno, para que el
responsable de producción siga su avance sin entrar en cada almacén.

#### Scenario: La orden resume sus pedidos

- **GIVEN** una orden con tres pedidos en distinto estado
- **WHEN** se consulta
- **THEN** indica cuántos son y en qué estado está cada uno

### Requirement: El código de la orden no cambia

El código identificativo de una orden SHALL asignarse al crearla y no SHALL modificarse después.

La implementación anterior lo regeneraba en cada listado, con lo que los códigos impresos dejaban de
coincidir (ver `DEFECTS.md` L-05).

#### Scenario: Listar no altera los códigos

- **GIVEN** una orden con su código asignado
- **WHEN** se lista el conjunto de órdenes varias veces
- **THEN** su código sigue siendo el mismo
