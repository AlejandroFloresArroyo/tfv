# Planes de trabajo

## Purpose

La programación del rodaje. Un **plan de trabajo** es lo que en producción se llama una orden del
día: qué se hace en una fecha, quién lo hace y en qué estado va cada cosa.

Tres niveles de granularidad, porque así trabaja un equipo de producción:

```
Plan de trabajo   →  una jornada de trabajo, opcionalmente ligada a una escena
   Tarea          →  algo que alguien tiene que hacer
      Actividad   →  los pasos concretos de esa tarea
```

Las tareas se asignan a un responsable y se clasifican por categoría, y la categoría puede apuntar a
un rol — que es como el trabajo llega al departamento correcto.

Tanto los planes como las tareas admiten comentarios, porque la coordinación real ocurre
conversando alrededor de una tarea concreta.

La presentación natural es un **calendario**, con vistas por año, mes, semana y día.

## Requirements

### Requirement: Planes de trabajo de una producción

Una producción SHALL poder registrar planes de trabajo, cada uno con su fecha, su responsable, sus
observaciones, su estado y un código identificativo único.

Un plan SHALL poder asociarse a una escena, y SHALL poder existir sin ella.

#### Scenario: Se crea un plan sin escena

- **WHEN** se crea un plan de trabajo sin indicar escena
- **THEN** queda registrado en la producción

#### Scenario: Se asocia un plan a una escena

- **WHEN** se asocia un plan a una escena
- **THEN** la escena refleja que tiene un plan asociado

#### Scenario: Se desvincula un plan de su escena

- **GIVEN** un plan asociado a una escena
- **WHEN** se le retira la escena
- **THEN** el plan sigue existiendo sin escena

### Requirement: Estados de un plan de trabajo

Un plan SHALL tener uno de cinco estados: pendiente, en curso, reprogramado, completado o cancelado.

#### Scenario: Un plan nace pendiente

- **WHEN** se crea un plan de trabajo
- **THEN** su estado es pendiente

#### Scenario: Un plan se reprograma

- **WHEN** se cambia la fecha de un plan y se marca como reprogramado
- **THEN** conserva sus tareas
- **AND** su estado refleja la reprogramación

### Requirement: Tareas de un plan

Un plan SHALL poder registrar tareas, cada una con su título, descripción, categoría, personaje,
responsable, creador, estado, fecha, fecha de término y archivos adjuntos.

El creador de una tarea SHALL ser siempre quien la creó, y no SHALL poder modificarse.

#### Scenario: El creador queda fijado

- **WHEN** un miembro crea una tarea
- **THEN** figura como su creador
- **AND** ese dato no puede cambiarse después

#### Scenario: Se asigna una tarea a otro miembro

- **WHEN** se asigna una tarea a un responsable distinto de su creador
- **THEN** ambos quedan registrados por separado

### Requirement: Estados de una tarea

Una tarea SHALL tener uno de cuatro estados: pendiente, en curso, completada o incompleta.

#### Scenario: Una tarea se cierra como incompleta

- **WHEN** se marca una tarea como incompleta
- **THEN** su estado lo refleja
- **AND** cuenta como cerrada en los recuentos del plan

### Requirement: Actividades de una tarea

Una tarea SHALL poder registrar actividades, cada una con su título, descripción, responsable,
creador, estado, fecha, fecha de término y archivos adjuntos.

Una actividad SHALL tener uno de dos estados: incompleta o completada.

#### Scenario: Se desglosa una tarea en actividades

- **WHEN** se añaden tres actividades a una tarea
- **THEN** las tres quedan registradas con estado incompleto

### Requirement: Recuentos por estado

Un plan SHALL exponer su número de tareas y su desglose por estado, y una tarea su número de
actividades y su desglose por estado, conforme a `computed-fields`.

Estos recuentos son la señal de avance que se lee de un vistazo en el calendario.

#### Scenario: El plan resume su avance

- **GIVEN** un plan con cinco tareas: dos completadas, dos en curso y una pendiente
- **WHEN** se consulta solicitando sus agregados
- **THEN** indica cinco tareas y el desglose correspondiente

### Requirement: Comentarios en planes y en tareas

Un plan y una tarea SHALL poder registrar comentarios, cada uno con su contenido y su autor.

Un comentario SHALL poder editarse y eliminarse por quien tenga permiso.

#### Scenario: Se comenta una tarea

- **WHEN** un miembro con permiso comenta una tarea
- **THEN** el comentario queda registrado con su autor y su instante

### Requirement: Archivos adjuntos

Una tarea y una actividad SHALL poder llevar archivos adjuntos, gestionados conforme a
`media-storage`.

#### Scenario: Se adjunta un archivo a una tarea

- **WHEN** se adjunta un documento a una tarea
- **THEN** queda asociado y es descargable por quien pueda ver la tarea

### Requirement: Vista de calendario

El sistema SHALL poder presentar los planes de trabajo de una producción como calendario, con vistas
por año, mes, semana y día.

La vista y la fecha mostrada SHALL representarse en la dirección, de modo que un calendario situado
en una fecha concreta se pueda compartir por enlace.

#### Scenario: Se comparte una semana concreta

- **WHEN** un usuario navega a una semana del calendario y copia la dirección
- **THEN** quien la abra ve esa misma semana

#### Scenario: Se cambia de vista conservando la fecha

- **GIVEN** el calendario situado en una fecha en vista de mes
- **WHEN** se cambia a vista de semana
- **THEN** se muestra la semana que contiene esa fecha

### Requirement: Filtrado de tareas dentro de los planes

El sistema SHALL permitir consultar los planes de una producción filtrando **sus tareas** por
categoría y por personaje, devolviendo cada plan únicamente con las tareas que cumplen el filtro.

#### Scenario: Se filtra el calendario por departamento

- **GIVEN** planes con tareas de varias categorías
- **WHEN** se filtra por una categoría
- **THEN** cada plan muestra sólo sus tareas de esa categoría
- **AND** los planes sin tareas coincidentes no aparecen

### Requirement: Consulta de planes por escena y por capítulo

El sistema SHALL poder devolver los planes de trabajo asociados a una escena, y los asociados a
cualquier escena de un capítulo.

#### Scenario: Se consultan los planes de un capítulo

- **GIVEN** un capítulo con escenas que tienen planes asociados
- **WHEN** se consultan los planes del capítulo
- **THEN** se obtienen los de todas sus escenas

### Requirement: Eliminación en cascada

Eliminar un plan SHALL eliminar sus tareas, y eliminar una tarea SHALL eliminar sus actividades y
sus comentarios.

La confirmación SHALL enumerar previamente lo que se perderá.

#### Scenario: La eliminación de un plan arrastra su contenido

- **GIVEN** un plan con cuatro tareas y sus actividades
- **WHEN** se elimina el plan
- **THEN** las tareas y sus actividades desaparecen con él

### Requirement: Documento y enlace del plan

Un plan de trabajo SHALL poder generarse como documento conforme a `pdf-documents`, con sus tareas
agrupadas por semana y por día, y SHALL poder compartirse por enlace público de sólo lectura.

#### Scenario: El equipo consulta el plan sin cuenta

- **WHEN** se comparte el enlace del plan de trabajo de una producción
- **THEN** quien lo abra ve el calendario con sus tareas
- **AND** no puede modificarlo

### Requirement: Búsqueda en planes y tareas

Los planes SHALL poder buscarse por nombre y observaciones, y las tareas y actividades por título y
descripción.

Los planes SHALL poder filtrarse por estado, responsable, escena y rango de fechas.

#### Scenario: Se localizan las tareas de un responsable

- **WHEN** se filtran las tareas por su responsable
- **THEN** aparecen sólo las asignadas a esa persona
