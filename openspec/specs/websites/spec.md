# Sitios

## Purpose

Cómo una empresa consigue una tienda pública y cómo el sistema decide, ante una petición entrante,
qué tienda servir.

Cada sitio se sirve en su propio **subdominio**, derivado de su identificador legible. La resolución
ocurre antes que cualquier otra cosa: el sistema mira el nombre de host, encuentra el sitio y
reescribe internamente la petición hacia el contenido de ese arrendatario.

La resolución atraviesa **tres compuertas**, y cada fallo tiene su propia página, porque el motivo
importa: no es lo mismo un sitio que no existe que uno cuya empresa dejó de pagar.

| Compuerta | Si falla |
|---|---|
| ¿Existe un sitio con ese subdominio y está publicado? | Página de sitio no encontrado |
| ¿La suscripción de su empresa está vigente? | Página de sitio no disponible |
| ¿Su empresa tiene habilitado el servicio de sitios? | Página de sitio no disponible |

El **tipo de sitio** —su vertical— determina qué páginas se sirven. Se declara mediante la categoría
del sitio, y hoy hay dos verticales reconocidas: tienda de almacén y tienda de mosaicos. Cualquier
otra se sirve como página en construcción, lo que permite dar de alta un sitio antes de decidir qué
va a vender.

## Requirements

### Requirement: Un sitio pertenece a una empresa

Un sitio SHALL pertenecer a una empresa y SHALL registrar su nombre, descripción, logotipo, icono,
categoría y estado de publicación.

SHALL referenciar la fuente de su catálogo: un almacén o una tienda de mosaicos, según su vertical.

#### Scenario: Se crea un sitio vinculado a un almacén

- **WHEN** un miembro con permiso crea un sitio de vertical de almacén referenciando uno de sus almacenes
- **THEN** el sitio queda registrado con esa fuente de catálogo

#### Scenario: Un sitio no puede referenciar recursos de otra empresa

- **WHEN** se intenta crear un sitio referenciando un almacén de otra empresa
- **THEN** la operación se rechaza

### Requirement: Identificador legible único del sitio

Un sitio SHALL tener un identificador legible único en toda la plataforma, derivado de su nombre y
ajustable manualmente.

El sistema SHALL permitir comprobar la disponibilidad de un identificador antes de intentar usarlo,
y SHALL rechazar con `409` uno ya ocupado.

#### Scenario: Se comprueba la disponibilidad antes de guardar

- **WHEN** se consulta si un identificador legible está libre
- **THEN** se obtiene una respuesta booleana

#### Scenario: Un identificador ocupado se rechaza

- **WHEN** se intenta asignar a un sitio un identificador legible ya usado por otro
- **THEN** la respuesta es `409`

### Requirement: Subdominio y dirección derivados

Un sitio SHALL exponer el subdominio en el que se sirve y su dirección completa, derivados de su
identificador legible conforme a `computed-fields`.

#### Scenario: El sitio conoce su dirección pública

- **WHEN** se consulta un sitio
- **THEN** expone su subdominio y su dirección completa

### Requirement: Resolución por subdominio

Ante una petición entrante, el sistema SHALL extraer el subdominio del nombre de host y SHALL
resolver el sitio correspondiente antes de servir contenido alguno.

Cuando el nombre de host no corresponda a un subdominio de sitios, la petición SHALL atenderse con
normalidad por la aplicación principal.

#### Scenario: El subdominio determina el arrendatario

- **GIVEN** un sitio publicado con un identificador legible conocido
- **WHEN** se solicita su subdominio
- **THEN** se sirve el contenido de ese sitio

#### Scenario: El dominio principal no se ve afectado

- **WHEN** se solicita el dominio principal de la plataforma
- **THEN** se sirve la aplicación principal, no una tienda

### Requirement: Sitio inexistente o no publicado

Cuando el subdominio no corresponda a ningún sitio, o el sitio exista pero no esté publicado, el
sistema SHALL servir la página de sitio no encontrado.

#### Scenario: Un subdominio libre muestra no encontrado

- **WHEN** se solicita un subdominio sin sitio asociado
- **THEN** se sirve la página de sitio no encontrado

#### Scenario: Un sitio despublicado se comporta como inexistente

- **GIVEN** un sitio existente y no publicado
- **WHEN** se solicita su subdominio
- **THEN** se sirve la página de sitio no encontrado
- **AND** no se revela que el sitio exista

### Requirement: Sitio de una empresa sin suscripción vigente

Cuando el sitio exista pero la suscripción de su empresa no esté vigente, el sistema SHALL servir
la página que indica que el sitio no está disponible.

#### Scenario: La suscripción vencida tumba la tienda

- **GIVEN** un sitio publicado cuya empresa tiene la suscripción vencida
- **WHEN** un visitante lo solicita
- **THEN** se sirve la página de sitio no disponible
- **AND** no se sirve el catálogo

### Requirement: Sitio de una empresa sin el servicio habilitado

Cuando el sitio exista y la suscripción esté vigente, pero la empresa no tenga habilitado el
servicio de sitios, el sistema SHALL servir la página que lo indica.

#### Scenario: Sin el servicio no se sirve la tienda

- **GIVEN** un sitio de una empresa con suscripción vigente y sin el servicio de sitios habilitado
- **WHEN** un visitante lo solicita
- **THEN** se sirve la página correspondiente
- **AND** no se sirve el catálogo

### Requirement: La vertical determina las páginas servidas

El sistema SHALL determinar la vertical del sitio a partir de su categoría, y SHALL servir el
conjunto de páginas que corresponda.

Una vertical no reconocida SHALL servir la página en construcción, sin producir error.

#### Scenario: Cada vertical sirve sus páginas

- **GIVEN** un sitio de vertical de almacén
- **WHEN** un visitante navega
- **THEN** dispone de las páginas de esa vertical

#### Scenario: Una vertical desconocida no rompe

- **GIVEN** un sitio con una categoría que no corresponde a ninguna vertical conocida
- **WHEN** un visitante lo solicita
- **THEN** se sirve la página en construcción

### Requirement: Sólo se publica lo que la fuente publica

El catálogo servido por un sitio SHALL limitarse a los elementos publicados de su fuente de
catálogo.

Despublicar un elemento en la fuente SHALL retirarlo del sitio sin requerir ninguna acción sobre el
sitio.

#### Scenario: Despublicar un producto lo retira de la tienda

- **GIVEN** un producto publicado y visible en la tienda
- **WHEN** se despublica en el almacén
- **THEN** deja de aparecer en la tienda

### Requirement: Metadatos del sitio

Cada página de un sitio SHALL exponer los metadatos que la identifiquen —título, descripción e
icono— derivados del sitio y del contenido concreto de la página.

#### Scenario: La ficha de producto tiene sus propios metadatos

- **WHEN** se solicita la página de un producto
- **THEN** sus metadatos reflejan ese producto y el sitio al que pertenece

### Requirement: Gestión de los sitios de una empresa

Un miembro con permiso SHALL poder crear, consultar, modificar y eliminar los sitios de su empresa,
y publicarlos y despublicarlos.

#### Scenario: Se despublica un sitio

- **WHEN** un miembro con permiso despublica un sitio
- **THEN** su subdominio deja de servir el catálogo

### Requirement: Eliminación de un sitio

Eliminar un sitio SHALL eliminar sus personalizaciones y liberar su identificador legible, sin
afectar al almacén o a la tienda de mosaicos que le servía de fuente.

#### Scenario: La fuente sobrevive al sitio

- **GIVEN** un sitio vinculado a un almacén
- **WHEN** se elimina el sitio
- **THEN** el almacén y su catálogo siguen intactos

#### Scenario: El identificador queda libre

- **GIVEN** un sitio eliminado
- **WHEN** se crea otro con el mismo identificador legible
- **THEN** la operación se completa

### Requirement: Sólo las empresas habilitadas aparecen en público

Las lecturas públicas que agregan contenido de varias empresas —directorios y listados generales—
SHALL limitarse a las empresas con el servicio de sitios habilitado y a su contenido publicado.

#### Scenario: Un directorio público filtra por habilitación

- **WHEN** se consulta un listado público que agrega contenido de varias empresas
- **THEN** sólo aparece el de las que tienen el servicio habilitado
