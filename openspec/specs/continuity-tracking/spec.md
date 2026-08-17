# Continuidad de rodaje

## Purpose

El registro de **cómo aparece cada personaje en cada jornada de rodaje**: qué lleva puesto, qué
objetos maneja, con qué referencias visuales se grabó. Es lo que permite que una escena grabada en
marzo enlace visualmente con otra grabada en julio.

La cadena es:

```
Jornada de rodaje  →  una por escena que se graba
   Continuidad     →  una por personaje presente en esa jornada
      Utilería     →  cada objeto o video de referencia de ese personaje
```

Una pieza de utilería es **o un artículo del inventario o un video de referencia**, nunca las dos
cosas. Distinguir eso importa: un artículo es algo que existe y hay que llevar al set; un video es
documentación de cómo debía verse.

Las notas de la jornada son el cuaderno del script: observaciones que no encajan en ninguna
estructura y que hay que poder escribir rápido.

## Requirements

### Requirement: Jornadas de rodaje de una escena

Una producción SHALL poder registrar jornadas de rodaje, cada una asociada a una escena, con su
nombre, su tipo —grabación o regrabación—, su estado y su responsable.

#### Scenario: Se programa una jornada

- **WHEN** un miembro con permiso crea una jornada indicando su escena
- **THEN** queda registrada en estado inicial

#### Scenario: Se distingue una regrabación

- **WHEN** se crea una jornada de tipo regrabación sobre una escena ya grabada
- **THEN** queda registrada como tal, sin alterar la jornada anterior

### Requirement: Estados de una jornada

Una jornada SHALL pasar por tres estados: borrador mientras se prepara, en curso mientras se graba,
y completada al terminar.

#### Scenario: Una jornada nace en borrador

- **WHEN** se crea una jornada
- **THEN** su estado es borrador

### Requirement: Asignar personajes abre la jornada

El sistema SHALL permitir asignar de una vez varios personajes a una jornada, creando una
continuidad por cada uno.

Esta acción SHALL poner la jornada en curso, porque asignar el reparto es el acto con el que empieza
el trabajo.

#### Scenario: Asignar el reparto crea las continuidades

- **GIVEN** una jornada en borrador
- **WHEN** se le asignan cuatro personajes
- **THEN** se crean cuatro continuidades, una por personaje
- **AND** la jornada pasa a en curso

#### Scenario: No se duplica un personaje ya asignado

- **GIVEN** una jornada con un personaje ya asignado
- **WHEN** se vuelve a asignar el mismo
- **THEN** no se crea una segunda continuidad para él

### Requirement: Una continuidad por personaje y jornada

Una continuidad SHALL pertenecer a una jornada, SHALL referenciar un personaje y SHALL registrar su
responsable y su lista de utilería.

Una continuidad SHALL poder quedarse sin personaje asignado, para registrar elementos que no
corresponden a ninguno en concreto.

#### Scenario: Se retira el personaje de una continuidad

- **GIVEN** una continuidad con personaje asignado
- **WHEN** se le retira el personaje
- **THEN** la continuidad sigue existiendo sin personaje
- **AND** conserva su utilería

### Requirement: Una pieza de utilería es artículo o video

Una pieza de utilería SHALL referenciar **o** un artículo del inventario de la producción **o** un
video de la biblioteca, y el sistema SHALL rechazar que referencie ambos o ninguno.

#### Scenario: No se admiten ambas referencias

- **WHEN** se intenta crear una pieza de utilería que referencia un artículo y un video a la vez
- **THEN** la operación se rechaza

#### Scenario: No se admite una pieza vacía

- **WHEN** se intenta crear una pieza de utilería sin referenciar nada
- **THEN** la operación se rechaza

### Requirement: Reconciliación de los artículos de una continuidad

El sistema SHALL permitir establecer de una vez el conjunto completo de artículos de una
continuidad, creando las piezas que falten y eliminando las que sobren.

La operación SHALL ser atómica y no SHALL afectar a las piezas que referencian videos.

#### Scenario: Se establece el conjunto de artículos

- **GIVEN** una continuidad con los artículos A, B y C, y un video
- **WHEN** se establece el conjunto de artículos a A y D
- **THEN** B y C dejan de figurar
- **AND** D pasa a figurar
- **AND** el video sigue ahí

### Requirement: Reconciliación de los videos de una continuidad

El sistema SHALL permitir establecer de una vez el conjunto completo de videos de una continuidad,
de forma atómica y sin afectar a las piezas que referencian artículos.

#### Scenario: Se establece el conjunto de videos

- **GIVEN** una continuidad con dos videos y tres artículos
- **WHEN** se establece el conjunto de videos a uno solo
- **THEN** queda un video
- **AND** los tres artículos siguen ahí

### Requirement: Eliminar una continuidad elimina su utilería

Eliminar una continuidad SHALL eliminar sus piezas de utilería y desvincularla de su jornada, sin
eliminar los artículos ni los videos referenciados.

#### Scenario: Los artículos sobreviven a la continuidad

- **GIVEN** una continuidad con cuatro artículos
- **WHEN** se elimina la continuidad
- **THEN** los cuatro artículos siguen en el inventario de la producción

### Requirement: Eliminar una jornada elimina sus continuidades

Eliminar una jornada de rodaje SHALL eliminar sus continuidades y la utilería de éstas, y SHALL
desvincularla de su escena.

#### Scenario: La eliminación arrastra las continuidades

- **GIVEN** una jornada con cuatro continuidades
- **WHEN** se elimina
- **THEN** las cuatro desaparecen con ella
- **AND** los artículos y videos referenciados siguen existiendo

### Requirement: Notas de la jornada

Una jornada SHALL poder registrar notas de texto libre, cada una con su contenido y su autor.

Las notas SHALL poder editarse y eliminarse por quien tenga permiso.

#### Scenario: Se registra una observación durante el rodaje

- **WHEN** un miembro con permiso añade una nota a una jornada
- **THEN** queda registrada con su autor y su instante

### Requirement: Consulta de la continuidad de un personaje

El sistema SHALL poder devolver todas las jornadas en las que aparece un personaje, atravesando sus
continuidades.

Esto es lo que permite revisar cómo apareció un personaje a lo largo del rodaje.

#### Scenario: Se revisa el historial de un personaje

- **GIVEN** un personaje presente en cinco jornadas
- **WHEN** se consulta su continuidad
- **THEN** se obtienen las cinco jornadas con la utilería registrada en cada una

### Requirement: Vista completa de una jornada

La consulta de una jornada SHALL devolver su escena con su capítulo, y sus continuidades con su
personaje y su utilería resuelta.

#### Scenario: La jornada se consulta de una vez

- **WHEN** se abre una jornada de rodaje
- **THEN** se ve a qué escena y capítulo corresponde
- **AND** se ven sus personajes con la utilería de cada uno

### Requirement: Dónde se ha usado un artículo

El sistema SHALL poder indicar, para un artículo del inventario de la producción, en qué notas de
entrega figura, en qué sets está asignado y en qué jornadas se usó a través de la continuidad.

#### Scenario: Se localiza un artículo antes de moverlo

- **WHEN** se consulta dónde se ha usado un artículo
- **THEN** se obtienen sus notas de entrega, sus sets y sus jornadas
