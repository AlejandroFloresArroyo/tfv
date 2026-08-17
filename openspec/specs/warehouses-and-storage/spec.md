# Almacenes y ubicaciones

## Purpose

Un **almacén** es el establecimiento desde el que una empresa renta y vende equipo. Es la raíz de
todo el servicio: productos, listas de precios, categorías, pedidos y cotizaciones cuelgan de él.
Una empresa puede tener varios.

Dentro de cada almacén hay un **árbol de ubicaciones físicas** que responde a una pregunta muy
concreta: *¿dónde está guardado esto?* Diez tipos de nodo, del más general al más específico:

| Tipo | Clave |
|---|---|
| Piso | FLR |
| Área | ARE |
| Pasillo | AIS |
| Sección | SEC |
| Bahía | BAY |
| Rack | RCK |
| Estante | SHF |
| Tarima | PLT |
| Caja | BOX |
| Contenedor | BIN |

Cada ubicación recibe un **código legible autogenerado** —`RCK3`, `BOX12`— porque son códigos que
la gente escribe en etiquetas y dice en voz alta al buscar algo en la nave.

## Requirements

### Requirement: Un almacén pertenece a una empresa

Un almacén SHALL pertenecer a exactamente una empresa y SHALL registrar su nombre, descripción,
imagen y prioridad de presentación.

Crear un almacén SHALL exigir que la empresa tenga habilitado el servicio de almacenes.

#### Scenario: Sin el servicio no se crea

- **GIVEN** una empresa sin el servicio de almacenes habilitado
- **WHEN** un propietario intenta crear un almacén
- **THEN** la operación se rechaza

### Requirement: Los almacenes se ordenan por prioridad

El listado de almacenes de una empresa SHALL ordenarse por prioridad descendente, después por fecha
de creación descendente y finalmente por nombre.

#### Scenario: La prioridad manda sobre la fecha

- **GIVEN** dos almacenes, el más antiguo con mayor prioridad
- **WHEN** se listan
- **THEN** el de mayor prioridad aparece primero

### Requirement: Identificador legible del almacén

Un almacén SHALL tener un identificador legible único derivado de su nombre, y SHALL poder marcarse
como publicado para que su catálogo sea visible en una tienda pública.

Cambiar el identificador legible SHALL rechazarse cuando ya esté ocupado por otro almacén.

#### Scenario: Un identificador ocupado se rechaza

- **WHEN** se intenta asignar a un almacén un identificador legible ya usado por otro
- **THEN** la operación se rechaza indicando el conflicto

#### Scenario: Un almacén no publicado no aparece en público

- **GIVEN** un almacén sin marcar como publicado
- **WHEN** un visitante lo solicita desde una tienda pública
- **THEN** la respuesta es `404`

### Requirement: Baja de un almacén

Eliminar un almacén SHALL aplicar borrado lógico al almacén y a su contenido —categorías,
ubicaciones, productos, listas de precios, pedidos y cotizaciones—, y SHALL enumerar previamente el
alcance.

El sistema SHALL impedir la baja cuando el almacén tenga pedidos o cotizaciones en curso.

#### Scenario: No se da de baja con trabajo en curso

- **GIVEN** un almacén con un pedido aceptado y sin finalizar
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza indicando el motivo

#### Scenario: La baja arrastra el contenido

- **GIVEN** un almacén sin trabajo en curso, con productos y categorías
- **WHEN** se da de baja
- **THEN** ni el almacén ni su contenido siguen accesibles
- **AND** el histórico de pedidos finalizados se conserva

### Requirement: Árbol de ubicaciones físicas

Una ubicación SHALL pertenecer a un almacén, SHALL tener un tipo de entre los diez previstos, y
SHALL poder tener una ubicación padre y varias hijas.

Una ubicación sin padre SHALL ser una raíz del almacén.

#### Scenario: Se anida una ubicación

- **GIVEN** un rack existente
- **WHEN** se crea un estante indicándolo como padre
- **THEN** el estante figura entre las hijas del rack

#### Scenario: El listado del almacén muestra las raíces

- **WHEN** se listan las ubicaciones de un almacén
- **THEN** aparecen sus raíces
- **AND** las hijas se consultan indicando su padre

### Requirement: Código legible autogenerado

Al crear una ubicación, el sistema SHALL asignarle un código formado por la clave de tres letras de
su tipo seguida de un número correlativo, contando las ubicaciones del mismo tipo que ya existan en
ese almacén.

#### Scenario: El correlativo cuenta por tipo y por almacén

- **GIVEN** un almacén con dos cajas y ningún rack
- **WHEN** se crea una caja
- **THEN** su código es `BOX3`
- **WHEN** se crea un rack
- **THEN** su código es `RCK1`

#### Scenario: Los códigos no se cruzan entre almacenes

- **GIVEN** dos almacenes, cada uno con una caja
- **WHEN** se consulta el código de cada una
- **THEN** ambas tienen el mismo código y son ubicaciones distintas

### Requirement: Cambiar el tipo regenera el código

Cuando se cambie el tipo de una ubicación, el sistema SHALL regenerar su código conforme al tipo
nuevo.

Modificar cualquier otro dato no SHALL alterar el código, porque puede estar impreso en etiquetas.

#### Scenario: Renombrar no cambia el código

- **GIVEN** una ubicación con código asignado
- **WHEN** se cambia su nombre
- **THEN** su código permanece igual

#### Scenario: Cambiar el tipo sí lo cambia

- **GIVEN** una caja con código `BOX4`
- **WHEN** se cambia su tipo a rack
- **THEN** recibe un código de rack

### Requirement: No se admiten ciclos en el árbol

El sistema SHALL rechazar asignar como padre de una ubicación a ella misma o a cualquiera de sus
descendientes.

#### Scenario: Una ubicación no puede colgar de su propia hija

- **GIVEN** un rack con un estante como hijo
- **WHEN** se intenta asignar el estante como padre del rack
- **THEN** la operación se rechaza

### Requirement: Los productos cuelgan de una ubicación

Un producto SHALL poder asignarse a una ubicación, y una ubicación SHALL exponer los productos
asignados directamente a ella y su recuento.

Las variantes y los accesorios de un producto SHALL heredar su ubicación, y no SHALL contarse por
separado en el recuento de la ubicación.

#### Scenario: El recuento no cuenta las variantes

- **GIVEN** una ubicación con un producto que tiene tres variantes
- **WHEN** se consulta su recuento de productos
- **THEN** es `1`

### Requirement: Eliminar una ubicación libera sus productos

Eliminar una ubicación SHALL eliminar también sus descendientes, y los productos asignados a
cualquiera de ellas SHALL quedar **sin ubicación**, sin eliminarse.

#### Scenario: Los productos sobreviven a la ubicación

- **GIVEN** una caja con productos asignados
- **WHEN** se elimina la caja
- **THEN** los productos siguen existiendo sin ubicación asignada

#### Scenario: La eliminación recorre el subárbol

- **GIVEN** un rack con tres estantes, cada uno con cajas
- **WHEN** se elimina el rack
- **THEN** se eliminan los estantes y las cajas

### Requirement: Presentación del árbol como jerarquía navegable

El sistema SHALL permitir presentar el árbol de ubicaciones de un almacén como una jerarquía
navegable, con capacidad de crear, modificar y eliminar nodos sobre ella y de seleccionar uno para
ver sus productos.

La selección SHALL representarse en la dirección, de modo que un nodo seleccionado se pueda
compartir por enlace.

#### Scenario: Seleccionar un nodo muestra sus productos

- **WHEN** el usuario selecciona una ubicación en el árbol
- **THEN** se muestran los productos asignados a ella
- **AND** la dirección refleja la selección
