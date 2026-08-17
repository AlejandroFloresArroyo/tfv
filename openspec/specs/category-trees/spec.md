# Árboles de categorías

## Purpose

Tres taxonomías jerárquicas que se comportan igual y sólo difieren en su alcance:

| Taxonomía | Alcance | Para qué |
|---|---|---|
| Global | Toda la plataforma | Sectores de empresa, tipos de locación, amenidades, verticales de sitio |
| De almacén | Un almacén | Clasificación del catálogo de productos |
| De producción | Una producción | Clasificación de artículos, tareas, videos, anclas y compras |

Comparten el mismo algoritmo de anidamiento, re-parentado y borrado recursivo, así que se
especifican una vez. Las diferencias de alcance son requisitos concretos al final.

La regla que más consecuencias tiene está fuera de esta capability y se cumple aquí: **filtrar por
una categoría incluye todas sus descendientes** (ver `query-and-pagination`). Sin eso, un árbol de
tres niveles sería inútil para navegar un catálogo.

## Requirements

### Requirement: Una categoría puede tener padre e hijas

Una categoría SHALL poder tener una categoría padre y varias hijas dentro de la misma taxonomía, sin
límite fijo de profundidad.

Una categoría sin padre SHALL ser una raíz.

#### Scenario: Se crea una categoría anidada

- **GIVEN** una categoría raíz
- **WHEN** se crea otra indicándola como padre
- **THEN** la nueva figura entre las hijas de la primera
- **AND** la primera figura como padre de la nueva

### Requirement: El listado por defecto muestra las raíces

Al listar una taxonomía sin indicar padre, el sistema SHALL devolver únicamente las categorías raíz.

Las hijas de una categoría SHALL consultarse indicando su padre.

#### Scenario: El listado no aplana el árbol

- **GIVEN** una taxonomía con tres raíces y varias hijas
- **WHEN** se lista sin indicar padre
- **THEN** aparecen las tres raíces
- **AND** no aparecen sus hijas al mismo nivel

### Requirement: Re-parentado de una categoría

Una categoría SHALL poder cambiar de padre, y el sistema SHALL actualizar de forma coherente tanto
el padre anterior como el nuevo.

Una categoría SHALL poder pasar a ser raíz retirándole el padre.

#### Scenario: Cambiar de padre actualiza ambos lados

- **GIVEN** una categoría hija de A
- **WHEN** se cambia su padre a B
- **THEN** deja de figurar entre las hijas de A
- **AND** figura entre las hijas de B

#### Scenario: Se promueve a raíz

- **WHEN** se retira el padre de una categoría
- **THEN** pasa a figurar en el listado de raíces

### Requirement: No se admiten ciclos

El sistema SHALL rechazar asignar como padre de una categoría a ella misma o a cualquiera de sus
descendientes.

#### Scenario: Una categoría no puede ser su propia ancestra

- **GIVEN** una categoría A con la hija B, que a su vez tiene la hija C
- **WHEN** se intenta asignar C como padre de A
- **THEN** la operación se rechaza

#### Scenario: Una categoría no puede ser su propio padre

- **WHEN** se intenta asignar una categoría como padre de sí misma
- **THEN** la operación se rechaza

### Requirement: Eliminar una categoría elimina sus descendientes

Eliminar una categoría SHALL eliminar también todas sus descendientes, a cualquier profundidad.

Las entidades clasificadas en cualquiera de las categorías eliminadas SHALL quedar sin categoría, y
no SHALL eliminarse.

La confirmación previa SHALL indicar cuántas categorías y cuántas entidades resultarán afectadas.

#### Scenario: La eliminación recorre todo el subárbol

- **GIVEN** una categoría con dos hijas, una de ellas con tres nietas
- **WHEN** se elimina la raíz de ese subárbol
- **THEN** se eliminan las seis categorías

#### Scenario: Los productos clasificados sobreviven

- **GIVEN** productos clasificados en una categoría que se elimina
- **WHEN** se completa la eliminación
- **THEN** los productos siguen existiendo
- **AND** quedan sin categoría

#### Scenario: Se advierte del alcance antes de eliminar

- **WHEN** se solicita eliminar una categoría con descendientes y entidades clasificadas
- **THEN** la confirmación indica cuántas categorías y cuántas entidades se verán afectadas

### Requirement: Presentación de una categoría

Una categoría SHALL registrar un nombre, y SHALL poder registrar descripción, color, icono e
imagen, para que las superficies puedan presentarla de forma reconocible.

#### Scenario: Se conserva la presentación

- **WHEN** se crea una categoría con color e icono
- **THEN** ambos se devuelven al consultarla

### Requirement: Identificador legible por taxonomía

Una categoría de almacén y una de la taxonomía global SHALL tener un identificador legible único
dentro de su alcance, derivado de su nombre, para poder referenciarla desde una dirección pública.

#### Scenario: Se resuelve una categoría por su identificador legible

- **WHEN** se solicita una categoría de almacén por su identificador legible dentro de ese almacén
- **THEN** se devuelve esa categoría

#### Scenario: Dos almacenes pueden repetir el mismo identificador

- **GIVEN** dos almacenes con una categoría del mismo nombre
- **WHEN** se consulta cada una dentro de su almacén
- **THEN** ambas se resuelven correctamente y son distintas

### Requirement: Alcance de la taxonomía global

La taxonomía global SHALL ser común a toda la plataforma y SHALL gestionarse únicamente por
administradores de plataforma.

Sus categorías SHALL poder asociarse a un servicio, para que cada servicio ofrezca sólo las
pertinentes.

#### Scenario: Un miembro no edita la taxonomía global

- **WHEN** un miembro de una empresa intenta crear una categoría global
- **THEN** la respuesta es `403`

#### Scenario: Se ofrecen las categorías del servicio pertinente

- **WHEN** se solicitan las categorías globales asociadas a un servicio
- **THEN** se devuelven sólo las de ese servicio

### Requirement: Alcance de la taxonomía de almacén

Las categorías de almacén SHALL pertenecer a un almacén concreto y SHALL ser visibles para los
miembros de su empresa y, cuando el almacén tenga tienda pública, para los visitantes de esa tienda.

#### Scenario: Las categorías no se cruzan entre almacenes

- **GIVEN** dos almacenes de la misma empresa
- **WHEN** se listan las categorías de uno
- **THEN** no aparecen las del otro

### Requirement: Alcance de la taxonomía de producción

Las categorías de producción SHALL pertenecer a una producción concreta y SHALL poder asociarse a
un rol, de modo que sirvan para dirigir el trabajo a un equipo determinado.

#### Scenario: Una categoría de producción apunta a un rol

- **WHEN** se crea una categoría de producción asociada a un rol
- **THEN** las tareas clasificadas en ella pueden filtrarse por ese rol
