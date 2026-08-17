# Campos calculados

## Purpose

Un conjunto de campos de este sistema **no se almacenan: se derivan**. No son adorno de
presentación — son lógica de negocio de la que dependen decisiones reales: si hay existencia para
vender, cuánto efectivo debería haber en la caja, en qué subdominio se sirve una tienda, qué tema
está vigente hoy.

En la implementación anterior eran campos virtuales del modelo de datos, siempre presentes en toda
lectura. Al cambiar de motor **desaparecen de forma automática**, y el riesgo real es que cada
endpoint los vuelva a derivar por su cuenta y con criterios distintos. Por eso se especifican aquí,
en un solo lugar y con su fórmula exacta.

Esta capability no describe endpoints. Describe **qué significa cada campo derivado y cómo se
calcula**, para que cualquier superficie que lo exponga coincida con las demás.

## Requirements

### Requirement: Los campos calculados son consistentes

Un campo calculado SHALL tener el mismo valor con independencia del endpoint que lo exponga, del
nivel de anidamiento en que aparezca y de si el recurso se leyó de forma individual o dentro de una
colección.

#### Scenario: El mismo campo coincide en dos lecturas distintas

- **WHEN** se lee una medida de producto por su identificador
- **AND** se lee la misma medida anidada dentro de su producto
- **THEN** su recuento de existencias por estado es idéntico en ambas lecturas

### Requirement: Presencia declarada de los campos calculados

Cada recurso SHALL declarar qué campos calculados incluye siempre y cuáles sólo cuando se soliciten
de forma explícita.

Los campos costosos —los que agregan sobre colecciones grandes— SHOULD ser opcionales y omitirse
por defecto en las lecturas de colección.

#### Scenario: Un agregado costoso no se calcula sin pedirlo

- **WHEN** se lista una colección de planes de trabajo sin solicitar sus agregados
- **THEN** la respuesta no incluye el desglose de tareas por estado
- **AND** la consulta no recorre las tareas de cada plan

### Requirement: Recuentos de elementos relacionados

El sistema SHALL exponer, como número entero, el recuento de elementos relacionados en los casos
siguientes. Un recuento SHALL ser `0`, nunca nulo ni ausente, cuando no haya elementos.

| Campo | Sobre | Cuenta |
|---|---|---|
| Existencias de una medida | Medida de producto | Unidades físicas ligadas a esa medida |
| Existencias de inventario de Pixit | Definición de inventario | **Suma de las cantidades** de sus movimientos, no el número de movimientos |
| Tareas de un plan | Plan de trabajo | Tareas del plan |
| Actividades de una tarea | Tarea | Actividades de la tarea |
| Escenas de un capítulo | Capítulo | Escenas del capítulo |
| Planes de una escena | Escena | Planes de trabajo asociados |
| Pedidos de una orden de compra | Orden de compra de producción | Pedidos de almacén derivados |
| Mensajes sin leer | Pedido de almacén | Mensajes que la parte que consulta no ha leído |
| Miembros de una empresa | Empresa | Membresías activas |
| Unidades de una línea de cotización | Línea de cotización | Unidades reservadas por esa línea |

#### Scenario: Una colección vacía cuenta cero

- **GIVEN** un capítulo sin escenas
- **WHEN** se lee el capítulo
- **THEN** su recuento de escenas es `0`

#### Scenario: El inventario de Pixit suma cantidades, no filas

- **GIVEN** una definición de inventario con un movimiento de entrada de `10` y otro de salida de `-3`
- **WHEN** se lee la definición
- **THEN** su existencia es `7`
- **AND** no es `2`

### Requirement: Desglose de existencias por estado

Toda medida de producto SHALL exponer un desglose que indique **cuántas unidades hay en cada uno de
los estados posibles**, incluyendo con valor cero los estados sin unidades.

Este desglose es la primitiva de disponibilidad de toda la plataforma: la venta pública, la reserva
por cotización y la aceptación de pedidos la consultan para decidir si hay existencia.

Los estados son: disponible, vendida, rentada, en pedido, en cotización, perdida, dañada, gastada,
modificada, robada e incompleta.

#### Scenario: El desglose incluye los estados vacíos

- **GIVEN** una medida con tres unidades disponibles y una vendida
- **WHEN** se lee la medida
- **THEN** el desglose indica `3` disponibles y `1` vendida
- **AND** indica `0` en los nueve estados restantes

#### Scenario: La disponibilidad se lee del desglose

- **GIVEN** una medida cuyo desglose indica `2` disponibles
- **WHEN** se intenta reservar `3` unidades sin autorización explícita para acuñar
- **THEN** la operación se rechaza por existencia insuficiente

### Requirement: Desglose de tareas y actividades por estado

Un plan de trabajo SHALL exponer el recuento de sus tareas agrupado por estado, y una tarea SHALL
exponer el recuento de sus actividades agrupado por estado, incluyendo con valor cero los estados
sin elementos.

#### Scenario: El desglose de un plan cubre todos sus estados

- **GIVEN** un plan con dos tareas pendientes y una completada
- **WHEN** se lee el plan solicitando sus agregados
- **THEN** el desglose indica `2` pendientes, `1` completada y `0` en los demás estados

### Requirement: Total de una sesión de caja

Una sesión de caja SHALL exponer el importe total de sus ventas, como la suma de los totales de
todas las ventas de mostrador que la referencian.

#### Scenario: El total suma todas las ventas de la sesión

- **GIVEN** una sesión con ventas de `100.00`, `250.50` y `49.50`
- **WHEN** se lee la sesión
- **THEN** su total es `400.00`

### Requirement: Efectivo esperado en caja

Una sesión de caja SHALL exponer el efectivo que debería haber al cerrarla, calculado como:

```
efectivo esperado = fondo inicial + Σ (total − cambio)   sólo de las ventas cobradas en efectivo
```

Las ventas cobradas por cualquier otro medio SHALL quedar excluidas de esta suma.

Este valor es el que se contrasta contra el conteo real al cerrar el turno, así que un error aquí
se traduce en un descuadre atribuido al cajero.

#### Scenario: Sólo el efectivo cuenta

- **GIVEN** una sesión con fondo inicial de `500.00`
- **AND** una venta en efectivo de `200.00` con cambio de `50.00`
- **AND** una venta con tarjeta de `300.00`
- **WHEN** se lee la sesión
- **THEN** el efectivo esperado es `650.00`
- **AND** la venta con tarjeta no ha influido

#### Scenario: Una sesión sin ventas conserva su fondo

- **GIVEN** una sesión recién abierta con fondo inicial de `500.00`
- **WHEN** se lee la sesión
- **THEN** el efectivo esperado es `500.00`

### Requirement: Precio final con descuento

Un producto que admita descuento SHALL exponer su precio final calculado como:

```
precio final = precio − round(precio × descuento ÷ 100, 2)   si el descuento está activo
precio final = precio                                        en caso contrario
```

#### Scenario: Un descuento activo reduce el precio final

- **GIVEN** un producto de `200.00` con un descuento activo del `15` por ciento
- **WHEN** se lee el producto
- **THEN** su precio final es `170.00`

#### Scenario: Un descuento inactivo no se aplica

- **GIVEN** un producto de `200.00` con un valor de descuento del `15` por ciento pero desactivado
- **WHEN** se lee el producto
- **THEN** su precio final es `200.00`

### Requirement: Dominio y dirección pública de un sitio

Un sitio SHALL exponer el subdominio en el que se sirve y su dirección completa, derivados así:

```
subdominio = <slug del sitio, o su identificador si no tiene slug> + "." + <dominio de sitios de la plataforma>
dirección  = <esquema> + "://" + subdominio
```

El esquema SHALL ser seguro en entornos productivos.

#### Scenario: Un sitio con slug deriva su subdominio

- **GIVEN** un sitio cuyo slug es `renta-cdmx` y un dominio de sitios `ejemplo.com`
- **WHEN** se lee el sitio en un entorno productivo
- **THEN** su subdominio es `renta-cdmx.sites.ejemplo.com`
- **AND** su dirección empieza por esquema seguro

### Requirement: Nombre completo y teléfono compuesto

Un usuario SHALL exponer su nombre completo como la concatenación de su nombre y su apellido
separados por un espacio, y su teléfono completo como la concatenación de su código de país y su
número, sin separador.

Ambos SHALL quedar sin espacios sobrantes cuando alguna de las partes falte.

#### Scenario: Un usuario sin apellido no arrastra espacio

- **GIVEN** un usuario con nombre "Ana" y sin apellido
- **WHEN** se lee el usuario
- **THEN** su nombre completo es exactamente `Ana`

### Requirement: Etiqueta compuesta de una escena

Una escena SHALL exponer el índice de su capítulo y una etiqueta compuesta que combine el índice
del capítulo con el índice de la escena, de modo que identifique la escena dentro de la producción
completa y no sólo dentro de su capítulo.

#### Scenario: La etiqueta identifica la escena en la producción

- **GIVEN** la escena número `4` del capítulo número `2`
- **WHEN** se lee la escena
- **THEN** su índice de capítulo es `2`
- **AND** su etiqueta compuesta distingue esta escena de la escena `4` de cualquier otro capítulo

### Requirement: Nivel de profundidad de una ubicación

Una ubicación de almacén SHALL exponer un nivel de profundidad numérico derivado de **su tipo**,
según una tabla fija que ordena los tipos de mayor a menor —de piso a contenedor—, y no de su
posición real en el árbol.

Esto permite validar que un nodo no se anide bajo otro de tipo igual o más específico.

#### Scenario: El nivel viene del tipo, no de la posición

- **GIVEN** dos ubicaciones del mismo tipo situadas a distinta altura del árbol
- **WHEN** se leen ambas
- **THEN** su nivel de profundidad es el mismo

### Requirement: Indicador de nota de entrega finalizada

Una nota de entrega SHALL exponer un indicador booleano de si está finalizada, derivado de su
estado y no almacenado por separado.

#### Scenario: Una nota completada se marca finalizada

- **GIVEN** una nota de entrega en estado completado
- **WHEN** se lee
- **THEN** su indicador de finalizada es verdadero

### Requirement: Dirección primaria de una empresa

Una empresa SHALL exponer su dirección primaria como la única de sus direcciones marcada como tal.
Cuando ninguna esté marcada, el campo SHALL ser nulo.

#### Scenario: Se expone la dirección marcada

- **GIVEN** una empresa con tres direcciones, una marcada como primaria
- **WHEN** se lee la empresa
- **THEN** su dirección primaria es esa
- **AND** las otras dos no aparecen en ese campo

#### Scenario: Sin marca no hay dirección primaria

- **GIVEN** una empresa cuyas direcciones no tienen marca de primaria
- **WHEN** se lee la empresa
- **THEN** su dirección primaria es nula

### Requirement: Personalización vigente de un sitio

Un sitio SHALL exponer **la única personalización que debe renderizarse ahora**, resuelta así:

1. Si existe alguna personalización programada cuya ventana de fechas incluya el instante actual,
   se elige esa.
2. En caso contrario, se elige la marcada como primaria.
3. Si no hay ninguna, el campo es nulo.

Cuando varias personalizaciones programadas solapen, SHALL elegirse de forma determinista.

#### Scenario: Una campaña vigente sustituye al tema primario

- **GIVEN** un sitio con un tema primario y una personalización programada del 1 al 31 de diciembre
- **WHEN** se lee el sitio el 15 de diciembre
- **THEN** la personalización vigente es la programada

#### Scenario: Fuera de la ventana vuelve el primario

- **GIVEN** el mismo sitio
- **WHEN** se lee el 15 de enero
- **THEN** la personalización vigente es la marcada como primaria

#### Scenario: Un sitio sin ninguna personalización

- **GIVEN** un sitio sin personalizaciones
- **WHEN** se lee
- **THEN** su personalización vigente es nula
- **AND** el sitio sigue siendo legible

### Requirement: Pago asociado a una cotización

Una cotización SHALL exponer su registro de pago cuando exista, como un único elemento y no como
una lista.

#### Scenario: Una cotización sin pago expone nulo

- **GIVEN** una cotización sobre la que no se ha registrado ningún pago
- **WHEN** se lee
- **THEN** su campo de pago es nulo
