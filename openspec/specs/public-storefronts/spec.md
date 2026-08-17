# Tiendas públicas

## Purpose

Lo que ve un visitante en el subdominio de una empresa. Dos verticales sobre la misma base:

| Vertical | Catálogo | Página propia |
|---|---|---|
| Tienda de almacén | Productos de un almacén, en venta o renta | — |
| Tienda de mosaicos | Productos de catálogo | Configurador de mosaicos |

Ambas comparten la navegación, el pie, las secciones construidas con el editor, el carrito, la
cuenta del comprador y el flujo de pago. Difieren en dos juegos de páginas de catálogo y en que la
de mosaicos añade el configurador, que es su principal reclamo.

El comprador **es un usuario de la plataforma** (decisión D-01): la cuenta con la que compra aquí
sirve en cualquier otra tienda. Lo que no le da es acceso a ningún panel de gestión.

## Requirements

### Requirement: Estructura común de la tienda

Toda tienda SHALL disponer de navegación, pie de página y las secciones definidas en la
personalización vigente, conforme a `site-builder`.

La navegación SHALL ofrecer acceso al catálogo, al carrito y a la cuenta del comprador.

#### Scenario: La tienda se compone de sus secciones

- **WHEN** un visitante abre la portada de una tienda
- **THEN** ve las secciones de la personalización vigente en su orden

### Requirement: Registro y acceso del comprador

Un visitante SHALL poder registrarse e iniciar sesión desde la propia tienda, sin salir de ella,
conforme a `user-accounts`.

Una cuenta creada desde una tienda SHALL ser una cuenta de plataforma ordinaria.

#### Scenario: El comprador se registra sin salir de la tienda

- **WHEN** un visitante se registra desde la tienda
- **THEN** obtiene una cuenta y vuelve a donde estaba

#### Scenario: La cuenta sirve en otra tienda

- **GIVEN** un comprador con cuenta creada en una tienda
- **WHEN** visita otra tienda de la plataforma
- **THEN** puede iniciar sesión con la misma cuenta

#### Scenario: Comprar no abre ningún panel

- **GIVEN** un comprador sin membresía en ninguna empresa
- **WHEN** intenta acceder al panel de gestión
- **THEN** no obtiene acceso

### Requirement: Cuenta del comprador en la tienda

Un comprador identificado SHALL poder consultar y editar sus direcciones y consultar sus pedidos
desde la tienda.

Los pedidos mostrados SHALL ser los suyos en todas las tiendas, no sólo en la actual.

#### Scenario: El comprador gestiona sus direcciones

- **WHEN** un comprador añade una dirección desde la tienda
- **THEN** queda disponible para elegirla al pagar

#### Scenario: Los pedidos abarcan todas las tiendas

- **GIVEN** un comprador con pedidos en dos tiendas
- **WHEN** consulta sus pedidos desde una de ellas
- **THEN** ve los de ambas

### Requirement: Catálogo público paginado y filtrable

El catálogo de una tienda SHALL presentarse paginado, con búsqueda por texto y filtros por
categoría, conforme a `query-and-pagination`.

Filtrar por una categoría SHALL incluir sus descendientes.

#### Scenario: Se navega por categorías anidadas

- **GIVEN** una categoría con subcategorías y productos en las hojas
- **WHEN** el visitante filtra por la categoría raíz
- **THEN** ve los productos de todo el subárbol

### Requirement: Ficha de producto

La ficha de un producto SHALL mostrar sus imágenes, su nombre, su descripción, su precio, su
disponibilidad y sus variantes, y SHALL permitir añadirlo al carrito.

Una ficha SHALL ser accesible tanto por el identificador legible del producto como por su
identificador, conforme a `api-conventions`.

#### Scenario: La ficha muestra la disponibilidad real

- **GIVEN** un producto con dos unidades disponibles
- **WHEN** un visitante abre su ficha
- **THEN** ve que hay dos disponibles

#### Scenario: Un producto agotado no se añade

- **GIVEN** un producto sin unidades disponibles
- **WHEN** el visitante intenta añadirlo al carrito
- **THEN** la acción se rechaza indicando que está agotado

### Requirement: Carrito del visitante

El carrito SHALL conservar sus líneas mientras el visitante navega y entre sesiones del mismo
navegador, y SHALL permitir cambiar cantidades y retirar líneas.

El carrito SHALL mostrar el subtotal actualizado y, cuando se conozca el destino, la estimación del
envío.

#### Scenario: El carrito sobrevive a la navegación

- **GIVEN** un carrito con dos líneas
- **WHEN** el visitante navega por el catálogo y vuelve
- **THEN** el carrito conserva sus dos líneas

#### Scenario: Cambiar la cantidad actualiza el subtotal

- **WHEN** el visitante aumenta la cantidad de una línea
- **THEN** el subtotal se actualiza

### Requirement: El carrito revalida antes de pagar

Antes de iniciar el pago, el sistema SHALL revalidar precios y existencias de todas las líneas, y
SHALL avisar al visitante de cualquier cambio en lugar de cobrarle en silencio.

#### Scenario: Un cambio de precio se avisa

- **GIVEN** un carrito cuyo producto ha subido de precio desde que se añadió
- **WHEN** el visitante procede a pagar
- **THEN** se le muestra el precio actual y se le pide confirmar

#### Scenario: Una línea agotada se señala

- **GIVEN** un carrito con una línea cuyo producto se agotó
- **WHEN** el visitante procede a pagar
- **THEN** se le indica qué línea no puede servirse

### Requirement: Modalidad de venta o renta en la tienda de almacén

Una tienda de almacén SHALL permitir elegir entre comprar y rentar, cuando el producto admita ambas,
y SHALL exigir el periodo cuando se elija rentar.

Un producto que sólo admita una modalidad SHALL ofrecer únicamente esa.

#### Scenario: Rentar exige el periodo

- **WHEN** el visitante elige rentar un producto
- **THEN** se le pide el periodo antes de continuar

### Requirement: Configurador de mosaicos en su tienda

Una tienda de mosaicos SHALL ofrecer una página en la que el visitante suba una fotografía y la
convierta en un mosaico, eligiendo tablero, tamaño y lámina.

El resultado SHALL poder añadirse al carrito conservando su diseño, conforme a `mosaic-generation`
y `storefront-checkout`.

#### Scenario: El visitante configura y compra su mosaico

- **WHEN** un visitante sube una foto, elige tablero y tamaño, y añade el resultado al carrito
- **THEN** el carrito conserva el diseño generado
- **AND** al pagar, el pedido lo incluye

#### Scenario: Un formato no admitido se rechaza al subir

- **WHEN** el visitante sube un archivo que no es una imagen admitida
- **THEN** se le indica en el momento y no se procesa

### Requirement: Retorno tras el pago

La tienda SHALL disponer de páginas de confirmación y de cancelación del pago, y el visitante SHALL
llegar a la que corresponda al volver del procesador.

La página de confirmación SHALL mostrar la referencia del pedido.

#### Scenario: El comprador vuelve con su referencia

- **WHEN** el comprador completa el pago
- **THEN** llega a la página de confirmación
- **AND** ve la referencia de su pedido

#### Scenario: Cancelar devuelve al carrito

- **WHEN** el comprador cancela el pago
- **THEN** llega a la página de cancelación
- **AND** su carrito sigue intacto

### Requirement: Idioma de la tienda

Una tienda SHALL poder servirse en los idiomas disponibles, y el visitante SHALL poder cambiarlo.

La elección SHALL persistir en su navegador.

#### Scenario: El visitante cambia el idioma

- **WHEN** un visitante cambia el idioma de la tienda
- **THEN** la interfaz se muestra en ese idioma
- **AND** al volver más tarde lo conserva

### Requirement: La tienda no expone datos de gestión

Las lecturas públicas SHALL exponer únicamente lo necesario para vender: catálogo, precios,
disponibilidad y datos de contacto del comercio.

No SHALL exponer costos, existencias por ubicación, datos de otros compradores ni información
fiscal del comercio.

#### Scenario: El costo interno no sale al público

- **WHEN** un visitante consulta la ficha de un producto
- **THEN** ve su precio de venta
- **AND** no ve su costo ni su ubicación física

#### Scenario: Un visitante no ve pedidos ajenos

- **WHEN** un visitante solicita un pedido que no es suyo
- **THEN** la respuesta es `404`

### Requirement: La tienda funciona sin cuenta hasta el pago

Un visitante SHALL poder navegar el catálogo y llenar el carrito sin identificarse, y SHALL
identificarse únicamente al proceder al pago.

Al identificarse, el carrito SHALL conservarse.

#### Scenario: El carrito sobrevive al inicio de sesión

- **GIVEN** un visitante anónimo con tres líneas en el carrito
- **WHEN** inicia sesión para pagar
- **THEN** el carrito conserva sus tres líneas

### Requirement: Página en construcción

Un sitio cuya vertical no esté reconocida SHALL servir una página en construcción con la identidad
visual del sitio.

#### Scenario: Un sitio sin vertical muestra su portada provisional

- **GIVEN** un sitio publicado sin vertical reconocida
- **WHEN** un visitante lo abre
- **THEN** ve la página en construcción con el logotipo y el nombre del sitio
