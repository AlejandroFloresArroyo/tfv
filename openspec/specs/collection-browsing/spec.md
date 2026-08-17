# Exploración de colecciones

## Purpose

Casi todas las pantallas de gestión son la misma pantalla: un título, una barra de búsqueda con
filtros, una rejilla de tarjetas y una paginación. Se repite decenas de veces sobre entidades
distintas, y su comportamiento debe ser idéntico en todas para que el usuario no tenga que
reaprenderlo.

La regla que lo gobierna todo: **el estado de exploración vive en la dirección**. Búsqueda, filtros
activos, página y tamaño de página son parámetros de la URL, no estado interno. De ahí se siguen
tres propiedades que el usuario da por hechas: un listado filtrado se puede compartir por enlace,
el botón de atrás del navegador deshace un filtro, y recargar la página no pierde nada.

Esta capability describe el contrato de esa pantalla. Consume `query-and-pagination` como
contrato de servidor.

## Requirements

### Requirement: El estado de exploración vive en la dirección

La búsqueda, los filtros activos, la página y el tamaño de página SHALL representarse como
parámetros de la dirección.

Cambiar cualquiera de ellos SHALL producir una entrada en el historial de navegación, de modo que
el gesto de retroceder deshaga el último cambio.

#### Scenario: Un listado filtrado se comparte por enlace

- **GIVEN** un usuario que ha aplicado una búsqueda y dos filtros
- **WHEN** copia la dirección y otro usuario con acceso la abre
- **THEN** ve el mismo listado con la misma búsqueda y los mismos filtros

#### Scenario: Retroceder deshace el filtro

- **WHEN** el usuario aplica un filtro y luego retrocede
- **THEN** el filtro desaparece y el listado vuelve al estado anterior

#### Scenario: Recargar conserva la exploración

- **WHEN** el usuario recarga la página con filtros aplicados
- **THEN** los filtros siguen aplicados

### Requirement: Búsqueda con retardo

La barra de búsqueda SHALL esperar a que el usuario deje de escribir antes de consultar, en lugar
de consultar por cada tecla.

Al cambiar el texto de búsqueda, la paginación SHALL volver a la primera página.

#### Scenario: Escribir rápido no dispara una consulta por letra

- **WHEN** el usuario escribe ocho caracteres seguidos
- **THEN** se realiza una sola consulta, con el texto completo

#### Scenario: Buscar reinicia la página

- **GIVEN** un usuario situado en la página cuatro
- **WHEN** escribe un término de búsqueda
- **THEN** el listado muestra la primera página de los resultados

### Requirement: Filtros por tipo de campo

El panel de filtros SHALL ofrecer un control adecuado al tipo de cada campo filtrable: selección
simple, selección múltiple, texto, número, rango numérico, fecha, rango de fechas y booleano.

Cada filtro SHALL poder limpiarse individualmente, y SHALL existir una acción que los limpie todos.

#### Scenario: Un rango numérico filtra por intervalo

- **WHEN** el usuario fija un rango de precio entre dos valores
- **THEN** el listado muestra sólo los elementos cuyo precio cae dentro del intervalo

#### Scenario: Limpiar todo devuelve el listado completo

- **GIVEN** un listado con tres filtros aplicados
- **WHEN** el usuario limpia todos los filtros
- **THEN** el listado muestra la colección sin filtrar
- **AND** la búsqueda por texto también se limpia

### Requirement: Los filtros activos se muestran y se quitan

Los filtros aplicados SHALL mostrarse como elementos visibles fuera del panel, cada uno indicando
el campo y el valor, y cada uno SHALL poder quitarse directamente desde ahí.

#### Scenario: Se quita un filtro desde su indicador

- **GIVEN** un listado con dos filtros aplicados y visibles
- **WHEN** el usuario quita uno desde su indicador
- **THEN** ese filtro desaparece y el otro permanece
- **AND** el listado se actualiza

### Requirement: Paginación navegable y con tamaño ajustable

La paginación SHALL permitir ir a la primera página, a la anterior, a la siguiente, a la última y a
una página concreta, y SHALL permitir elegir el tamaño de página entre las opciones disponibles.

SHALL indicar la página actual, el total de páginas y el total de elementos.

Cambiar el tamaño de página SHALL volver a la primera página.

#### Scenario: Cambiar el tamaño reinicia la página

- **GIVEN** un usuario en la página tres con doce elementos por página
- **WHEN** cambia a cuarenta y ocho por página
- **THEN** se sitúa en la primera página

#### Scenario: Se informa del total

- **WHEN** se muestra un listado paginado
- **THEN** se indica la página actual, cuántas hay en total y cuántos elementos hay

### Requirement: Vistas de rejilla, lista y carrusel

Una colección SHALL poder presentarse como rejilla de tarjetas, como lista o como carrusel, según
lo que la pantalla determine, con el mismo conjunto de datos y las mismas acciones por elemento.

#### Scenario: Cambiar de vista no cambia el conjunto

- **WHEN** una colección se presenta en rejilla y luego en lista
- **THEN** contiene los mismos elementos, en el mismo orden
- **AND** ofrece las mismas acciones sobre cada uno

### Requirement: Estados de carga, vacío y error

Toda colección SHALL distinguir visualmente cuatro situaciones: cargando, con elementos, vacía y en
error.

El estado de carga SHALL preservar la disposición para evitar saltos. El estado vacío SHALL
distinguir **"no hay nada"** de **"no hay resultados para estos filtros"**, y en el segundo caso
SHALL ofrecer limpiar los filtros. El estado de error SHALL ofrecer reintentar.

#### Scenario: Se distingue vacío de sin resultados

- **GIVEN** una colección con elementos
- **WHEN** el usuario aplica un filtro que no coincide con ninguno
- **THEN** se indica que no hay resultados para esos filtros
- **AND** se ofrece limpiarlos

#### Scenario: Una colección genuinamente vacía invita a crear

- **GIVEN** una colección sin ningún elemento y sin filtros aplicados
- **WHEN** se muestra
- **THEN** se indica que aún no hay elementos
- **AND** se ofrece crear el primero

#### Scenario: Un error se puede reintentar

- **GIVEN** una consulta que falla
- **WHEN** se muestra el estado de error
- **THEN** se ofrece reintentar sin recargar la página

### Requirement: El listado se actualiza tras una mutación

Al crear, modificar o eliminar un elemento, las colecciones afectadas SHALL reflejar el cambio sin
que el usuario tenga que recargar ni navegar.

La actualización SHALL declararse **por recurso afectado**, no invocando manualmente el refresco de
cada consulta concreta. Este requisito existe porque la implementación anterior encadenaba
mil doscientas llamadas manuales de refresco repartidas por las pantallas, lo que hacía que
"qué se actualiza tras qué" fuese una decisión distinta en cada sitio (ver `DEFECTS.md` F-02).

#### Scenario: Crear un elemento lo hace aparecer

- **GIVEN** un listado de productos abierto
- **WHEN** el usuario crea un producto
- **THEN** aparece en el listado sin recargar

#### Scenario: La actualización alcanza a las vistas dependientes

- **GIVEN** un producto visible en su listado y también en el detalle de su categoría
- **WHEN** se modifica su nombre
- **THEN** ambas superficies muestran el nombre nuevo

#### Scenario: Eliminar ajusta el conteo

- **GIVEN** un listado que indica veinticinco elementos
- **WHEN** el usuario elimina uno
- **THEN** el conteo pasa a veinticuatro
- **AND** la paginación se ajusta si la página quedó vacía

### Requirement: La página no se reinicia con un diálogo abierto

Cuando haya un diálogo abierto sobre el listado, las actualizaciones de datos no SHALL devolver al
usuario a la primera página ni alterar su posición de desplazamiento.

#### Scenario: Editar desde la página cuatro no devuelve a la primera

- **GIVEN** un usuario en la página cuatro que abre el diálogo de edición de un elemento
- **WHEN** guarda los cambios
- **THEN** sigue en la página cuatro
- **AND** ve el elemento actualizado en su sitio

### Requirement: Acciones por elemento agrupadas

Cada elemento de una colección SHALL ofrecer sus acciones agrupadas en un único punto de acceso, en
lugar de repartirlas por la tarjeta.

Las acciones no permitidas para el usuario SHALL omitirse, no mostrarse desactivadas sin
explicación.

#### Scenario: Sólo se ofrecen las acciones permitidas

- **GIVEN** un miembro sin permiso para eliminar productos
- **WHEN** abre las acciones de un producto
- **THEN** no aparece la acción de eliminar
- **AND** sí aparecen las que sí tiene permitidas

### Requirement: Maestro y detalle adaptado al ancho

Las pantallas que presenten una colección junto al detalle del elemento seleccionado SHALL mostrar
ambos paneles cuando haya ancho suficiente, y SHALL presentar el detalle como panel deslizante
sobre la colección cuando no lo haya.

La selección SHALL representarse en la dirección, de modo que un elemento seleccionado se pueda
compartir por enlace.

#### Scenario: En pantalla estrecha el detalle se superpone

- **GIVEN** una pantalla por debajo del ancho de tableta
- **WHEN** el usuario selecciona un elemento
- **THEN** el detalle aparece como panel deslizante sobre la colección
- **AND** cerrarlo devuelve a la colección con la misma posición
