# Catálogo de Pixit

## Purpose

Los datos maestros del negocio de mosaicos de ladrillo. Son globales a la plataforma, no por tienda:
definen **qué se puede fabricar**, mientras que el inventario define **qué tiene cada tienda**.

| Entidad | Qué define | Dato clave |
|---|---|---|
| **Tablero** | Una línea de producto | El diseño, no el tamaño |
| **Tamaño de tablero** | Cuántas láminas de ancho por alto | Aquí vive el precio |
| **Lámina** | La placa base | Cuántos ladrillos caben en cada eje |
| **Ladrillo** | Un color de la paleta | Su valor cromático |
| **Sala** | Fondo para previsualizar el mosaico colgado | Posición y escala |
| **Términos** | Condiciones legales por idioma | Aparecen en el recibo |
| **Producto** | Mercancía suelta, no mosaicos | Tiene existencia propia |
| **Tienda** | El establecimiento físico | Ancla el inventario y las ventas |

Conviene fijar la relación entre las tres primeras, porque es lo que determina el tamaño de un
mosaico:

```
mosaico = tamaño.x × tamaño.y  láminas
lámina  = lámina.x × lámina.y  ladrillos
total   = (tamaño.x × lámina.x) × (tamaño.y × lámina.y) ladrillos
```

## Requirements

### Requirement: Tableros y sus tamaños

El sistema SHALL registrar tableros con su nombre y su imagen, y para cada uno los tamaños
disponibles.

Un tamaño SHALL registrar su nombre, abreviatura, descripción, imagen, precio, y cuántas láminas
ocupa de ancho y de alto.

#### Scenario: Un tablero expone sus tamaños

- **WHEN** se consulta un tablero
- **THEN** se obtienen los tamaños disponibles para él

#### Scenario: Las dimensiones son al menos uno

- **WHEN** se intenta crear un tamaño con cero láminas de ancho
- **THEN** la operación se rechaza

### Requirement: Láminas

El sistema SHALL registrar láminas con su nombre, imagen, precio, y cuántos ladrillos caben a lo
ancho y a lo alto.

#### Scenario: Se registra una lámina

- **WHEN** se crea una lámina de treinta y dos por treinta y dos ladrillos
- **THEN** queda registrada con esas dimensiones

### Requirement: Paleta de ladrillos

El sistema SHALL registrar los colores de ladrillo disponibles, cada uno con su nombre, su valor
cromático, su precio y su imagen.

El valor cromático SHALL ser el que se usa para cuantizar los píxeles de la fotografía, conforme a
`mosaic-generation`.

#### Scenario: Se añade un color a la paleta

- **WHEN** se crea un color con su valor cromático
- **THEN** queda disponible para la cuantización

#### Scenario: Un valor cromático inválido se rechaza

- **WHEN** se intenta crear un color con un valor cromático mal formado
- **THEN** la operación se rechaza

### Requirement: Salas de previsualización

El sistema SHALL registrar salas con su imagen, la posición donde se sitúa el mosaico y su escala.

#### Scenario: Se previsualiza un mosaico en una sala

- **WHEN** se elige una sala para previsualizar
- **THEN** el mosaico se muestra sobre ella en la posición y escala configuradas

### Requirement: Términos y condiciones por idioma

El sistema SHALL registrar versiones de términos y condiciones, cada una con su código de idioma
único, su título, su contenido y su bandera.

El contenido SHALL admitir texto enriquecido conforme a `forms-and-wizards`.

#### Scenario: Se consulta la versión de un idioma

- **WHEN** se solicitan los términos por su código de idioma
- **THEN** se obtiene la versión correspondiente

#### Scenario: Un código de idioma duplicado se rechaza

- **WHEN** se intenta crear una segunda versión con un código ya usado
- **THEN** la respuesta es `409`

### Requirement: Productos de mercancía

Una empresa SHALL poder registrar productos de mercancía con su nombre, descripción, precio,
existencia, descuento, imágenes y estado de publicación.

Un producto SHALL exponer su precio final conforme a `computed-fields`.

#### Scenario: Un producto con descuento muestra su precio final

- **GIVEN** un producto de `500.00` con un descuento activo del veinte por ciento
- **WHEN** se consulta
- **THEN** su precio final es `400.00`

#### Scenario: La existencia limita la venta

- **GIVEN** un producto con dos unidades
- **WHEN** un comprador intenta llevar tres
- **THEN** la operación se rechaza

### Requirement: Tiendas de una empresa

Una empresa SHALL poder registrar tiendas, cada una con su nombre, descripción, moneda, dirección,
imagen y estado de publicación.

Crear una tienda SHALL exigir que la empresa tenga habilitado el servicio de Pixit.

#### Scenario: Sin el servicio no se crea la tienda

- **GIVEN** una empresa sin el servicio de Pixit habilitado
- **WHEN** un propietario intenta crear una tienda
- **THEN** la operación se rechaza

### Requirement: Identificadores legibles y publicación

Las tiendas y los productos SHALL tener un identificador legible único y SHALL poder publicarse
para aparecer en una tienda pública.

#### Scenario: Un producto despublicado no aparece

- **GIVEN** un producto publicado y visible
- **WHEN** se despublica
- **THEN** deja de aparecer en la tienda pública

### Requirement: Qué falta por dar de alta en una tienda

El sistema SHALL poder indicar, para una tienda, qué tamaños de tablero, qué láminas y qué colores
del catálogo **no** tiene aún en su inventario.

Esto es lo que permite configurar una tienda nueva sin repasar el catálogo entero a mano.

#### Scenario: Se listan los colores pendientes

- **GIVEN** una tienda con parte de la paleta dada de alta
- **WHEN** se consultan los colores no utilizados
- **THEN** se obtienen únicamente los que faltan

### Requirement: Eliminar datos maestros en uso

El sistema SHALL impedir eliminar un tablero, un tamaño, una lámina o un color que esté referenciado
por el inventario de alguna tienda o por una venta, e indicar qué lo está usando.

#### Scenario: Un color en uso no se elimina

- **GIVEN** un color presente en el inventario de una tienda
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza indicando dónde se usa

#### Scenario: Eliminar un tablero arrastra sus tamaños

- **GIVEN** un tablero sin referencias, con tres tamaños
- **WHEN** se elimina
- **THEN** los tres tamaños desaparecen con él

### Requirement: Eliminar una tienda arrastra su inventario

Eliminar una tienda SHALL eliminar su inventario y sus ventas mediante borrado lógico, conservando
el historial contable.

El sistema SHALL impedir la eliminación con una sesión de caja abierta.

#### Scenario: No se elimina con la caja abierta

- **GIVEN** una tienda con una sesión de caja activa
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza

### Requirement: Búsqueda del catálogo

Los tableros, tamaños, láminas y salas SHALL poder buscarse por nombre; los colores por nombre y
valor cromático; los productos y tiendas por nombre y descripción; y los términos por nombre e
identificador legible.

#### Scenario: Se busca un color por su valor cromático

- **WHEN** se busca por el valor cromático de un color
- **THEN** ese color aparece en los resultados
