# Constructor de sitios

## Purpose

Cómo una empresa decide qué aspecto tiene su tienda y qué secciones muestra, sin escribir código.

Una **personalización** es un tema completo: un color, un banner y una lista ordenada de secciones
con su contenido. Un sitio puede tener varias, y aquí está lo interesante: **una es la primaria y
las demás pueden programarse por fechas**. Una campaña de diciembre sustituye al tema habitual
mientras dura y se retira sola, sin que nadie tenga que acordarse de desactivarla.

Las secciones son bloques con un tipo conocido —portada, categorías, productos, acerca de,
características, testimonios, preguntas frecuentes, pie— cada uno con sus campos editables, sus
elementos y sus botones.

## Requirements

### Requirement: Una personalización pertenece a un sitio

Una personalización SHALL pertenecer a un sitio y SHALL registrar su nombre, su color, su banner, si
es la primaria, si está programada y, en tal caso, su ventana de fechas.

#### Scenario: Se crea una personalización

- **WHEN** un miembro con permiso crea una personalización para un sitio
- **THEN** queda registrada con su nombre y su color

### Requirement: Sólo una personalización primaria por sitio

Un sitio SHALL tener como máximo una personalización marcada como primaria, y marcar una SHALL
desmarcar la anterior.

La primera personalización de un sitio SHALL quedar marcada como primaria.

#### Scenario: Marcar una desmarca la anterior

- **GIVEN** un sitio con la personalización A como primaria
- **WHEN** se marca B como primaria
- **THEN** B queda como primaria y A deja de estarlo

#### Scenario: La primera es primaria

- **GIVEN** un sitio sin personalizaciones
- **WHEN** se crea la primera
- **THEN** queda marcada como primaria

### Requirement: Personalizaciones programadas por fechas

Una personalización SHALL poder programarse indicando una fecha de inicio y una de fin, y SHALL
estar vigente únicamente dentro de esa ventana.

Una personalización programada y vigente SHALL tener precedencia sobre la primaria, conforme a
`computed-fields`.

#### Scenario: La campaña sustituye al tema habitual

- **GIVEN** un sitio con tema primario y una campaña programada para diciembre
- **WHEN** un visitante lo abre el quince de diciembre
- **THEN** ve la campaña

#### Scenario: Fuera de la ventana vuelve el primario

- **GIVEN** el mismo sitio
- **WHEN** un visitante lo abre en enero
- **THEN** ve el tema primario

#### Scenario: La campaña se retira sola

- **GIVEN** una campaña cuya fecha de fin ya pasó
- **WHEN** un visitante abre el sitio
- **THEN** ve el tema primario sin que nadie haya desactivado la campaña

### Requirement: Eliminar la primaria promueve otra

Eliminar la personalización primaria de un sitio que conserve otras SHALL promover otra a primaria
de forma determinista.

#### Scenario: Se promueve una sustituta

- **GIVEN** un sitio con tres personalizaciones, una primaria
- **WHEN** se elimina la primaria
- **THEN** una de las restantes queda marcada como primaria

### Requirement: Catálogo de tipos de sección

El sistema SHALL ofrecer un catálogo cerrado de tipos de sección, cada uno con sus campos editables
declarados.

Una sección de un tipo no reconocido SHALL omitirse al renderizar, sin romper la página.

#### Scenario: Un tipo desconocido no rompe la página

- **GIVEN** una personalización con una sección de tipo no reconocido
- **WHEN** se renderiza el sitio
- **THEN** el resto de secciones se muestran con normalidad
- **AND** la desconocida se omite

### Requirement: Contenido de una sección

Una sección SHALL registrar si se muestra, su tipo, su título, su descripción, su icono, sus
propiedades, sus estilos, sus elementos y sus botones.

Cada elemento SHALL registrar su código, título, descripción, icono, avatar e imagen. Cada botón
SHALL registrar su código, etiqueta, icono, valor, tipo de acción y variante visual.

#### Scenario: Se edita el contenido de una sección

- **WHEN** se modifican el título y los elementos de una sección
- **THEN** el sitio los refleja

### Requirement: Ocultar una sección sin eliminarla

Una sección SHALL poder ocultarse conservando su contenido, y SHALL poder volver a mostrarse.

Una sección oculta no SHALL renderizarse en el sitio público.

#### Scenario: Ocultar conserva el contenido

- **GIVEN** una sección con contenido
- **WHEN** se oculta y después se vuelve a mostrar
- **THEN** conserva todo su contenido

### Requirement: Orden de las secciones

Las secciones SHALL tener un orden explícito, SHALL renderizarse en él, y SHALL poder reordenarse
arrastrándolas.

#### Scenario: Reordenar cambia el sitio

- **WHEN** se mueve la sección de testimonios por encima de la de productos
- **THEN** el sitio la muestra en esa posición

### Requirement: Tipos de acción de los botones

Un botón SHALL declarar su tipo de acción: enlace a una dirección, desplazamiento a una sección de
la propia página, o acción de la aplicación.

Un botón de desplazamiento SHALL referenciar una sección existente en la misma personalización.

#### Scenario: Un botón de desplazamiento apunta a una sección

- **WHEN** se configura un botón de desplazamiento hacia la sección de preguntas frecuentes
- **THEN** al pulsarlo el visitante llega a esa sección

#### Scenario: Un destino inexistente se rechaza

- **WHEN** se configura un botón de desplazamiento hacia una sección que no está en la personalización
- **THEN** la operación se rechaza

### Requirement: Vista previa en el editor

El editor SHALL mostrar una vista previa del sitio que refleje los cambios sin necesidad de
publicarlos.

La vista previa SHALL usar el mismo renderizado que el sitio público, de modo que lo que se ve sea
lo que se sirve.

#### Scenario: La vista previa refleja el cambio al momento

- **WHEN** se cambia el color de la personalización
- **THEN** la vista previa lo muestra sin recargar

#### Scenario: La vista previa no afecta al sitio público

- **GIVEN** cambios sin guardar en el editor
- **WHEN** un visitante abre el sitio
- **THEN** ve la versión guardada, no la del editor

### Requirement: Contenido inicial por vertical

Al crear la primera personalización de un sitio, el sistema SHALL proponer un conjunto de secciones
inicial adecuado a la vertical del sitio, ya poblado con contenido de ejemplo.

#### Scenario: Un sitio nuevo nace con secciones

- **WHEN** se crea la primera personalización de un sitio de vertical de almacén
- **THEN** trae un conjunto de secciones apropiado para esa vertical
- **AND** el propietario puede editarlas o eliminarlas

### Requirement: Las secciones de catálogo leen de la fuente

Las secciones que muestran productos o categorías SHALL obtenerlos de la fuente de catálogo del
sitio, y SHALL respetar el estado de publicación de cada elemento.

La personalización SHALL poder acotar qué se muestra, pero no SHALL poder mostrar elementos no
publicados.

#### Scenario: La sección de productos no muestra lo despublicado

- **GIVEN** una sección de productos configurada para mostrar una categoría
- **WHEN** se despublica uno de los productos de esa categoría
- **THEN** deja de aparecer en la sección
