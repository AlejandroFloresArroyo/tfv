# Directorio de locaciones

## Purpose

Un catálogo de espacios donde rodar: casas, naves, estudios, exteriores. Una empresa agrupa sus
locaciones en **redes**, y las publica para que aparezcan en el directorio público de la plataforma.

La ficha de una locación es más rica que la de un producto porque quien busca dónde rodar necesita
saber cosas muy concretas: si hay estacionamiento, si hay internet y con qué clave, cómo se llega,
qué actividades se permiten y cuáles no, y qué días y horas está disponible.

Las tarifas se declaran por hora, día, semana y mes, cada una con su tiempo mínimo de contratación.

> **Alcance.** Las **reservas** quedan fuera (ver `project.md`, decisión D-09). Existían a medias en
> la implementación anterior —su ruta de actualización nunca llegó a registrarse y ninguna pantalla
> las consumía—, así que el directorio se reimplementa sin ellas. La contratación se gestiona hoy
> por contacto directo.

## Requirements

### Requirement: Redes de una empresa

Una empresa SHALL poder registrar redes de locaciones, cada una con su nombre, descripción e imagen.

Crear una red SHALL exigir que la empresa tenga habilitado el servicio de locaciones.

#### Scenario: Sin el servicio no se crea

- **GIVEN** una empresa sin el servicio de locaciones habilitado
- **WHEN** un propietario intenta crear una red
- **THEN** la operación se rechaza

### Requirement: Locaciones de una red

Una red SHALL poder registrar locaciones, cada una con su nombre, descripción, dirección,
coordenadas, imágenes, responsable, capacidad y superficie.

#### Scenario: Se registra una locación

- **WHEN** un miembro con permiso crea una locación en una red
- **THEN** queda registrada con su dirección y sus coordenadas

### Requirement: Instrucciones de acceso y servicios

Una locación SHALL poder registrar sus instrucciones de llegada, su información de estacionamiento
—si lo hay, de qué tipo y con qué instrucciones— y su conexión a internet —si la hay, con su nombre
de red y su clave—.

La clave de la conexión SHALL exponerse únicamente a los miembros de la empresa, nunca en las
lecturas públicas.

#### Scenario: La clave no sale al público

- **GIVEN** una locación publicada con datos de conexión
- **WHEN** un visitante consulta su ficha pública
- **THEN** ve que hay conexión disponible
- **AND** no ve la clave

### Requirement: Actividades permitidas y denegadas

Una locación SHALL poder declarar qué actividades se permiten y cuáles no, referenciando la
taxonomía global y admitiendo además anotaciones en texto libre.

#### Scenario: Se declaran restricciones

- **WHEN** se registra una locación indicando actividades denegadas y una anotación adicional
- **THEN** ambas se conservan y se muestran en su ficha

### Requirement: Interiores y exteriores

Una locación SHALL poder declarar qué interiores y qué exteriores ofrece, referenciando la taxonomía
global y admitiendo anotaciones en texto libre.

#### Scenario: Se detalla lo que ofrece el espacio

- **WHEN** se registran los interiores y exteriores de una locación
- **THEN** aparecen en su ficha

### Requirement: Disponibilidad semanal

Una locación SHALL poder declarar, por cada día de la semana, si está disponible y en qué franja
horaria.

#### Scenario: Se declara la disponibilidad de un día

- **WHEN** se marca un día como disponible con su franja horaria
- **THEN** la ficha lo refleja

#### Scenario: Un día no disponible se señala

- **WHEN** se marca un día como no disponible
- **THEN** la ficha lo indica y no muestra franja horaria

### Requirement: Tarifas por unidad de tiempo

Una locación SHALL poder declarar tarifas por hora, día, semana y mes, cada una indicando si está
disponible, su importe y su tiempo mínimo de contratación.

#### Scenario: Se declara una tarifa con mínimo

- **WHEN** se registra una tarifa por hora con un mínimo de cuatro horas
- **THEN** la ficha muestra el importe y el mínimo

#### Scenario: Una tarifa no disponible no se ofrece

- **GIVEN** una locación sin tarifa mensual disponible
- **WHEN** se consulta su ficha
- **THEN** no se ofrece la contratación por mes

### Requirement: Clasificación de la locación

Una locación SHALL poder clasificarse por categoría y por tipo, ambos referenciando la taxonomía
global.

#### Scenario: Se filtra el directorio por categoría

- **WHEN** se filtra el directorio por una categoría
- **THEN** aparecen las locaciones clasificadas en ella y en sus descendientes

### Requirement: Publicación en el directorio público

Una locación SHALL poder marcarse como publicada y SHALL tener un identificador legible único, para
aparecer en el directorio público de la plataforma.

El directorio público SHALL limitarse a las locaciones publicadas de empresas con el servicio de
sitios habilitado.

#### Scenario: Una locación despublicada no aparece

- **GIVEN** una locación visible en el directorio público
- **WHEN** se despublica
- **THEN** deja de aparecer
- **AND** solicitarla directamente devuelve `404`

#### Scenario: Sin el servicio de sitios no aparece en público

- **GIVEN** una locación publicada de una empresa sin el servicio de sitios habilitado
- **WHEN** se consulta el directorio público
- **THEN** no aparece

### Requirement: Consulta del directorio

El directorio SHALL poder consultarse de forma paginada, con búsqueda por nombre, descripción y
nombre de categoría, y filtros por categoría, tipo, capacidad y disponibilidad.

#### Scenario: Se busca una locación por su descripción

- **WHEN** se busca un término presente en la descripción de una locación
- **THEN** aparece en los resultados

### Requirement: Eliminación

Eliminar una red SHALL eliminar sus locaciones mediante borrado lógico.

Eliminar una locación SHALL eliminar sus imágenes propias y liberar su identificador legible.

#### Scenario: La eliminación de la red arrastra sus locaciones

- **GIVEN** una red con cuatro locaciones
- **WHEN** se elimina la red
- **THEN** las cuatro dejan de estar accesibles

#### Scenario: La eliminación no toca la taxonomía

- **WHEN** se elimina una locación
- **THEN** las categorías que referenciaba siguen existiendo
