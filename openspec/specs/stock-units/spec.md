# Unidades de existencia

## Purpose

**Una fila es un objeto físico.** No un contador, no un saldo: la cámara concreta que está en la
caja `BOX7` y que tiene pegada una etiqueta con su código.

Es la decisión de modelado más consecuente del servicio de almacenes, y la correcta para este
negocio: cuando rentas equipo, necesitas saber *cuál* de las tres cámaras salió, quién la tiene y en
qué estado volvió. Un contador no responde a eso.

De ahí se sigue todo lo demás: reservar es marcar unidades concretas, la disponibilidad es un
recuento por estado, y las etiquetas impresas son parte del flujo de trabajo real.

### Estados de una unidad

| Estado | Significado |
|---|---|
| Disponible | En el almacén, libre para comprometerse |
| En cotización | Apartada por una cotización que aún no se cierra |
| En pedido | Comprometida en un pedido |
| Rentada | Fuera, en poder de un cliente, con retorno esperado |
| Vendida | Fuera definitivamente |
| Perdida | No se encuentra |
| Dañada | En el almacén, no utilizable |
| Robada | Sustraída |
| Incompleta | Le faltan partes |
| Modificada | Alterada respecto de su especificación |
| Gastada | Consumida |

Los tres primeros son **compromisos reversibles**; el resto son estados terminales o de incidencia.

## Requirements

### Requirement: Una unidad es un objeto físico

Una unidad SHALL pertenecer a exactamente una medida de producto y SHALL tener un estado y un código
identificativo único.

Dos unidades de la misma medida SHALL ser registros distintos, aunque sean indistinguibles
físicamente.

#### Scenario: Cinco unidades son cinco registros

- **WHEN** se crean cinco unidades para una medida
- **THEN** existen cinco registros, cada uno con su propio código

### Requirement: Código identificativo único por unidad

Toda unidad SHALL recibir al crearse un código identificativo único en el sistema, y no SHALL
cambiar durante su vida.

#### Scenario: El código acompaña a la unidad

- **GIVEN** una unidad etiquetada con su código
- **WHEN** cambia de estado varias veces
- **THEN** su código sigue siendo el mismo

### Requirement: Una unidad nace disponible

Toda unidad creada SHALL quedar en estado disponible, salvo que se indique otro explícitamente.

#### Scenario: El alta deja la unidad disponible

- **WHEN** se crean unidades para una medida sin indicar estado
- **THEN** todas quedan disponibles

### Requirement: Alta individual y masiva

El sistema SHALL permitir crear una unidad o varias a la vez para una medida.

#### Scenario: Se crean veinte de una vez

- **WHEN** se solicitan veinte unidades para una medida
- **THEN** se crean veinte, cada una con su código único

### Requirement: Modificación individual y masiva del estado

El sistema SHALL permitir cambiar el estado de una unidad, de un conjunto indicado de unidades, o de
todas las de una medida.

Toda modificación masiva SHALL ser atómica.

#### Scenario: Se marcan varias como dañadas

- **WHEN** se marcan tres unidades concretas como dañadas
- **THEN** las tres quedan dañadas
- **AND** el resto de la medida no cambia

#### Scenario: Un fallo parcial no aplica nada

- **GIVEN** una modificación masiva en la que una de las unidades no admite el cambio
- **WHEN** se procesa
- **THEN** ninguna de las unidades cambia de estado

### Requirement: Un compromiso vigente bloquea el cambio manual

El sistema SHALL rechazar el cambio manual de estado de una unidad que esté comprometida en una
cotización o un pedido vigentes.

Liberar una unidad comprometida SHALL hacerse deshaciendo el compromiso, no cambiando su estado a
mano, para que la cotización y el inventario no se contradigan.

#### Scenario: No se libera a mano una unidad reservada

- **GIVEN** una unidad en estado de cotización
- **WHEN** se intenta marcar manualmente como disponible
- **THEN** la operación se rechaza
- **AND** el mensaje indica qué cotización la retiene

#### Scenario: Retirarla de la cotización sí la libera

- **GIVEN** la misma unidad
- **WHEN** se retira la línea de la cotización
- **THEN** la unidad vuelve a estar disponible

### Requirement: Una unidad terminal no vuelve a comprometerse

Una unidad en estado vendida, perdida, robada o gastada no SHALL poder comprometerse en una
cotización ni en un pedido.

Una unidad dañada, incompleta o modificada SHALL poder devolverse a disponible mediante una acción
explícita, tras su reparación o revisión.

#### Scenario: Una unidad vendida no se cotiza

- **GIVEN** una unidad vendida
- **WHEN** se intenta reservar para una cotización
- **THEN** no se selecciona
- **AND** no cuenta como disponible

#### Scenario: Una unidad reparada vuelve al inventario

- **GIVEN** una unidad dañada
- **WHEN** se marca explícitamente como disponible
- **THEN** vuelve a contarse entre las disponibles

### Requirement: Eliminar unidades

El sistema SHALL permitir eliminar unidades individualmente o en conjunto, y SHALL rechazar la
eliminación de una unidad comprometida o con historial en documentos cerrados.

Una unidad con historial SHALL eliminarse mediante borrado lógico, para no romper los documentos que
la mencionan.

#### Scenario: Una unidad vendida conserva su rastro

- **GIVEN** una unidad que figura en un pedido finalizado
- **WHEN** se elimina
- **THEN** deja de aparecer en el inventario
- **AND** el pedido finalizado sigue mostrándola

### Requirement: Etiquetas legibles por máquina

El sistema SHALL poder generar, para cada unidad, una etiqueta con su código representado en formato
legible por máquina, apta para imprimir.

SHALL ofrecerse tanto en formato de código bidimensional como de código de barras lineal, y SHALL
poder imprimirse en lote para varias unidades a la vez.

#### Scenario: Se imprimen etiquetas en lote

- **WHEN** se solicitan las etiquetas de las doce unidades de una medida
- **THEN** se genera un documento imprimible con las doce

#### Scenario: La etiqueta identifica la unidad concreta

- **WHEN** se lee la etiqueta de una unidad
- **THEN** el código corresponde a esa unidad y no a su medida ni a su producto

### Requirement: Localización de una unidad por su código

El sistema SHALL permitir localizar una unidad a partir de su código, devolviendo su medida, su
producto, su ubicación física y su estado.

#### Scenario: Se localiza una unidad escaneada

- **WHEN** se busca por el código de una etiqueta
- **THEN** se obtiene la unidad con su producto, su ubicación y su estado

### Requirement: Consulta de unidades por medida

El sistema SHALL permitir listar las unidades de una medida, de forma paginada y filtrable por
estado.

#### Scenario: Se filtran las disponibles

- **WHEN** se listan las unidades de una medida filtrando por disponibles
- **THEN** sólo aparecen las que están en ese estado

### Requirement: Todo cambio de estado deja rastro

Todo cambio de estado de una unidad SHALL registrar el estado anterior, el nuevo, quién lo provocó,
cuándo y por qué motivo —acción manual, movimiento de cotización, pedido o venta pública—.

Este historial SHALL ser consultable por unidad.

#### Scenario: Se puede reconstruir la vida de una unidad

- **GIVEN** una unidad que pasó de disponible a cotizada, luego a rentada y de nuevo a disponible
- **WHEN** se consulta su historial
- **THEN** aparecen los cuatro momentos con su motivo y su responsable

#### Scenario: Un cambio automático también deja rastro

- **WHEN** una unidad cambia de estado por el cierre de una cotización
- **THEN** el historial lo registra indicando la cotización que lo causó
