# Desglose de guion

## Purpose

La estructura narrativa de una producción: el guion se divide en **capítulos** y cada capítulo en
**escenas**. Es el esqueleto sobre el que se organiza todo el rodaje — las jornadas graban escenas,
los planes de trabajo se asocian a escenas, y la continuidad se lleva por escena.

Los **índices** son el elemento central: capítulos y escenas se identifican por su número, no por su
nombre, y ese número es lo que la gente dice en el set. Por eso el sistema ayuda a elegirlo —cuál
es el siguiente libre— y valida que no se repita.

Una escena se identifica de forma completa combinando el índice de su capítulo con el suyo propio,
conforme a `computed-fields`.

La extracción automática del guion se especifica aparte, en `script-ai-sync`.

## Requirements

### Requirement: Guiones de una producción

Una producción SHALL poder registrar varios guiones, cada uno con su nombre, su índice, su archivo y
su responsable.

Un guion SHALL indicar si su contenido ya se extrajo a capítulos y escenas.

#### Scenario: Se registra un guion

- **WHEN** un miembro con permiso sube un guion a una producción
- **THEN** queda registrado y marcado como no extraído

#### Scenario: Sustituir el archivo invalida la extracción

- **GIVEN** un guion ya extraído
- **WHEN** se sustituye su archivo
- **THEN** vuelve a marcarse como no extraído

### Requirement: Capítulos de una producción

Una producción SHALL poder registrar capítulos, cada uno con su nombre, su sinopsis, su índice, su
responsable y, opcionalmente, el guion del que procede.

#### Scenario: Se crea un capítulo

- **WHEN** un miembro con permiso crea un capítulo indicando nombre e índice
- **THEN** queda registrado en la producción

### Requirement: Escenas de un capítulo

Un capítulo SHALL poder registrar escenas, cada una con su nombre, su índice y su sinopsis.

Una escena SHALL pertenecer a exactamente un capítulo.

#### Scenario: Se crea una escena en un capítulo

- **WHEN** se crea una escena indicando su capítulo, su nombre y su índice
- **THEN** queda registrada en ese capítulo

### Requirement: Los índices no se repiten

El índice de un capítulo SHALL ser único dentro de su producción, y el de una escena SHALL ser único
dentro de su capítulo.

El sistema SHALL rechazar con `409` un índice ya ocupado.

#### Scenario: Un índice de capítulo repetido se rechaza

- **GIVEN** una producción con el capítulo número tres
- **WHEN** se intenta crear otro capítulo con el mismo número
- **THEN** la respuesta es `409`

#### Scenario: El mismo índice de escena en otro capítulo sí vale

- **GIVEN** la escena número cinco del capítulo uno
- **WHEN** se crea la escena número cinco del capítulo dos
- **THEN** la operación se completa

### Requirement: Consulta del siguiente índice libre

El sistema SHALL poder indicar el último índice usado en una producción o en un capítulo, para que
la interfaz proponga el siguiente.

SHALL poder además comprobar si un índice concreto está libre, antes de intentar usarlo.

#### Scenario: Se propone el siguiente índice

- **GIVEN** un capítulo cuya última escena es la número siete
- **WHEN** se consulta su último índice
- **THEN** se obtiene `7`
- **AND** la interfaz propone `8`

#### Scenario: Se comprueba un índice antes de guardar

- **WHEN** se consulta si un índice está libre en un capítulo
- **THEN** se obtiene una respuesta booleana

### Requirement: Recuentos de la estructura

Un capítulo SHALL exponer cuántas escenas tiene, y una escena cuántos planes de trabajo la
referencian, conforme a `computed-fields`.

#### Scenario: El capítulo indica sus escenas

- **GIVEN** un capítulo con seis escenas
- **WHEN** se consulta
- **THEN** indica seis

### Requirement: Eliminar un capítulo elimina sus escenas

Eliminar un capítulo SHALL eliminar todas sus escenas, y SHALL enumerar previamente cuántas son.

#### Scenario: La eliminación arrastra las escenas

- **GIVEN** un capítulo con seis escenas
- **WHEN** se elimina el capítulo
- **THEN** las seis escenas desaparecen con él

### Requirement: Eliminar una escena libera lo que la referencia

Eliminar una escena SHALL dejar sin escena las jornadas de rodaje y los planes de trabajo que la
referenciaban, y SHALL devolverlos a su estado inicial, sin eliminarlos.

Este comportamiento evita que borrar una escena destruya el trabajo de programación asociado.

#### Scenario: Las jornadas sobreviven a la escena

- **GIVEN** una escena con una jornada de rodaje en curso
- **WHEN** se elimina la escena
- **THEN** la jornada sigue existiendo sin escena asignada
- **AND** vuelve a su estado inicial

#### Scenario: Los planes de trabajo sobreviven

- **GIVEN** una escena con dos planes de trabajo asociados
- **WHEN** se elimina la escena
- **THEN** los dos planes siguen existiendo sin escena asignada
- **AND** vuelven a su estado inicial

### Requirement: Eliminar un guion desvincula los capítulos

Eliminar un guion SHALL dejar sin guion los capítulos que lo referenciaban, sin eliminarlos ni
alterar sus escenas.

#### Scenario: Los capítulos sobreviven al guion

- **GIVEN** un guion del que se extrajeron tres capítulos
- **WHEN** se elimina el guion
- **THEN** los tres capítulos y sus escenas siguen existiendo

### Requirement: Consulta de la estructura completa

El sistema SHALL poder devolver la estructura de una producción como el conjunto de sus capítulos
con sus escenas, para presentarla como un índice navegable.

SHALL poder además devolver todas las escenas de una producción atravesando sus capítulos.

#### Scenario: Se obtiene el índice navegable

- **WHEN** se solicita la estructura de una producción
- **THEN** se obtienen sus capítulos ordenados por índice
- **AND** cada uno con sus escenas ordenadas por índice

### Requirement: Búsqueda en el desglose

Los capítulos SHALL poder buscarse por nombre y descripción, y las escenas por nombre y sinopsis.

#### Scenario: Se localiza una escena por su sinopsis

- **WHEN** se busca un término presente en la sinopsis de una escena
- **THEN** la escena aparece en los resultados
