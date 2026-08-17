# Producciones

## Purpose

La raíz del servicio de producciones: un proyecto audiovisual con sus fechas, y los tres catálogos
que lo acompañan durante todo el rodaje.

| Entidad | Qué es |
|---|---|
| Producción | El proyecto. Todo lo demás cuelga de ella |
| Personaje | Quién aparece. Se usa para organizar la continuidad y asignar tareas |
| Set | Un decorado, entendido como el conjunto de artículos que lo componen |
| Video | Material audiovisual de referencia: pruebas, ensayos, tomas guardadas |

Una producción es la mayor cascada de borrado del sistema: al eliminarla desaparecen capítulos,
escenas, personajes, sets, artículos, videos, jornadas, continuidades, planes de trabajo, entregas,
anclas, compras y órdenes.

## Requirements

### Requirement: Una producción pertenece a una empresa

Una producción SHALL pertenecer a una empresa y SHALL registrar su nombre, descripción, imagen,
fecha de inicio y fecha de fin.

Crear una producción SHALL exigir que la empresa tenga habilitado el servicio de producciones.

#### Scenario: Sin el servicio no se crea

- **GIVEN** una empresa sin el servicio de producciones habilitado
- **WHEN** un propietario intenta crear una producción
- **THEN** la operación se rechaza

#### Scenario: La fecha de fin no precede al inicio

- **WHEN** se crea una producción con fecha de fin anterior a la de inicio
- **THEN** la operación se rechaza

### Requirement: Publicación de la producción

Una producción SHALL poder marcarse como publicada y SHALL tener un identificador legible único,
para aparecer en los directorios públicos de la plataforma.

Una producción no publicada no SHALL ser visible desde superficies públicas.

#### Scenario: Una producción despublicada no aparece

- **GIVEN** una producción visible en el directorio público
- **WHEN** se despublica
- **THEN** deja de aparecer
- **AND** solicitarla directamente devuelve `404`

### Requirement: Eliminación de una producción

Eliminar una producción SHALL aplicar borrado lógico a la producción y a todo su contenido, y SHALL
enumerar previamente el alcance.

El sistema SHALL impedir la eliminación cuando la producción tenga órdenes de compra en curso o
equipo rentado sin devolver.

#### Scenario: Se advierte del alcance

- **WHEN** se solicita eliminar una producción con contenido
- **THEN** la confirmación enumera qué se verá afectado

#### Scenario: No se elimina con equipo fuera

- **GIVEN** una producción con equipo rentado de un almacén y sin devolver
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza indicando el motivo

#### Scenario: La eliminación no toca a la empresa

- **WHEN** se elimina una producción
- **THEN** la empresa a la que pertenece sigue intacta
- **AND** sus otras producciones también

### Requirement: Personajes de la producción

Una producción SHALL poder registrar sus personajes, cada uno con su nombre, descripción, imagen y
responsable.

#### Scenario: Se registra un personaje

- **WHEN** un miembro con permiso crea un personaje en una producción
- **THEN** queda disponible para asignarlo a continuidades y tareas

### Requirement: Eliminar un personaje libera sus continuidades

Eliminar un personaje SHALL dejar sin personaje las continuidades que lo referenciaban, sin
eliminarlas.

#### Scenario: Las continuidades sobreviven al personaje

- **GIVEN** un personaje con continuidades registradas
- **WHEN** se elimina
- **THEN** las continuidades siguen existiendo sin personaje asignado

### Requirement: Sets de la producción

Una producción SHALL poder registrar sus sets, cada uno con su nombre, descripción, imagen,
responsable y la lista de artículos que lo componen.

Un artículo SHALL poder formar parte de varios sets.

#### Scenario: Un artículo pertenece a dos sets

- **WHEN** se añade el mismo artículo a dos sets
- **THEN** figura en ambos

#### Scenario: Eliminar un set no elimina sus artículos

- **GIVEN** un set con artículos asignados
- **WHEN** se elimina el set
- **THEN** los artículos siguen existiendo en el inventario de la producción

### Requirement: Biblioteca de videos

Una producción SHALL poder registrar videos con su nombre, su archivo, su categoría y su
responsable, y SHALL permitir reproducirlos desde la aplicación.

#### Scenario: Se reproduce un video de la biblioteca

- **WHEN** un miembro abre un video de la producción
- **THEN** puede reproducirlo sin descargarlo

### Requirement: Eliminar un video libera sus referencias

Eliminar un video SHALL eliminar las referencias de utilería que lo señalaban, sin afectar a las
continuidades que las contenían.

#### Scenario: La continuidad sobrevive al video

- **GIVEN** una continuidad con una referencia a un video
- **WHEN** se elimina el video
- **THEN** la continuidad sigue existiendo
- **AND** su referencia a ese video desaparece

### Requirement: Consulta de las producciones de una empresa

Los miembros de una empresa SHALL poder consultar sus producciones de forma paginada, con búsqueda
por nombre y descripción y filtros por fechas y estado de publicación.

#### Scenario: Se buscan producciones por nombre

- **WHEN** un miembro busca por parte del nombre de una producción
- **THEN** aparece en los resultados

### Requirement: Panel de la producción

Una producción SHALL exponer un resumen de su estado: número de capítulos y escenas, jornadas de
rodaje por estado, planes de trabajo por estado, y la diferencia entre lo presupuestado y lo
gastado.

#### Scenario: El panel resume la producción

- **WHEN** un miembro abre una producción
- **THEN** ve sus recuentos y su situación presupuestaria de un vistazo
