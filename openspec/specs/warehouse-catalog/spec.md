# Catálogo de almacén

## Purpose

Qué equipo tiene un almacén, cómo está organizado y cuánto cuesta. Tres niveles que conviene no
confundir:

| Nivel | Qué es | Ejemplo |
|---|---|---|
| **Producto** | El artículo del catálogo | "Cámara Sony FX6" |
| **Medida** | La variante mensurable a la que se lleva existencia | "Cuerpo", "Kit con óptica" |
| **Unidad** | Un objeto físico concreto | La cámara con número de serie tal |

Las unidades se especifican aparte, en `stock-units`. Aquí llegamos hasta la medida.

Un producto puede tener **variantes** —el mismo artículo en otra configuración— y **accesorios**
—cosas que lo acompañan—. Ambos son productos hijos y heredan la clasificación del padre, lo que
evita reclasificar veinte variantes a mano.

Las medidas cargan con algo inesperado: además de dimensiones y peso, incluyen una **ficha de
sastrería de 45 campos** —cuello, busto, entrepierna, altura del arco del pie—, porque el mismo
sistema que renta cámaras renta vestuario, y el vestuario se mide por el cuerpo de quien lo va a
llevar.

### Precedencia de precio

Cuando hay que resolver el precio de una medida, este es el orden:

| # | Origen | Aplica a |
|---|---|---|
| 1 | Tarifa del producto en la lista de precios aplicable | Venta y renta |
| 2 | Precio escalar del producto | Sólo venta |
| 3 | Cero | Último recurso |

## Requirements

### Requirement: Datos de un producto

Un producto SHALL pertenecer a un almacén y SHALL registrar su nombre, descripción, código interno,
código identificativo único, costo, precio, imágenes, responsable, ubicación y clasificación.

SHALL indicar además si está disponible para venta, si lo está para renta, y si sus precios provienen
de listas de precios.

#### Scenario: Se crea un producto con lo mínimo

- **WHEN** se crea un producto con nombre y almacén
- **THEN** queda registrado con un código identificativo único generado por el sistema
- **AND** su responsable es quien lo creó si no se indicó otro

### Requirement: Código identificativo único por producto

Todo producto SHALL recibir un código identificativo único en el sistema, apto para representarse
como código legible por máquina en una etiqueta.

El código SHALL generarse con un procedimiento que no produzca colisiones y no SHALL cambiar una vez
asignado.

#### Scenario: El código no cambia al editar

- **GIVEN** un producto con código asignado
- **WHEN** se modifica cualquiera de sus datos
- **THEN** su código permanece igual

### Requirement: Variantes y accesorios como productos hijos

Un producto SHALL poder tener variantes y accesorios, ambos productos con referencia a su padre.

Un hijo SHALL heredar del padre su almacén, su ubicación, su clasificación, su responsable y sus
imágenes en el momento de crearse, y SHALL poder divergir después.

#### Scenario: Un hijo hereda la clasificación

- **GIVEN** un producto clasificado en una categoría y ubicado en una caja
- **WHEN** se le crea una variante
- **THEN** la variante nace con la misma categoría y la misma ubicación

#### Scenario: Los hijos se distinguen por su código

- **WHEN** se crean una variante y un accesorio de un mismo producto
- **THEN** cada uno recibe su propio código identificativo único

### Requirement: Creación de un producto con toda su estructura

El sistema SHALL permitir crear en una sola operación un producto junto con sus medidas, sus
existencias iniciales, sus tarifas, sus variantes y sus accesorios.

La operación SHALL ser **atómica**: si falla cualquier parte, no SHALL quedar creada ninguna.

#### Scenario: Un fallo no deja producto a medias

- **GIVEN** una creación con tres medidas y dos variantes
- **WHEN** falla al crear la segunda variante
- **THEN** no queda creado el producto ni ninguna de sus medidas, existencias o variantes

#### Scenario: Se crean las existencias iniciales

- **WHEN** se crea un producto con una medida que declara cinco unidades
- **THEN** se crean cinco unidades disponibles para esa medida

### Requirement: La reclasificación se propaga a los hijos

Cambiar la categoría, la clasificación global o la ubicación de un producto SHALL propagar el cambio
a todas sus variantes y accesorios, a cualquier profundidad.

#### Scenario: Cambiar la ubicación mueve las variantes

- **GIVEN** un producto con cuatro variantes en la misma caja
- **WHEN** se cambia la ubicación del padre
- **THEN** las cuatro variantes quedan en la ubicación nueva

### Requirement: Los listados muestran sólo los productos raíz

El listado de productos de un almacén SHALL mostrar únicamente los productos sin padre.

Las variantes y los accesorios SHALL consultarse desde su padre.

#### Scenario: Las variantes no aparecen sueltas

- **GIVEN** un producto con tres variantes
- **WHEN** se lista el catálogo del almacén
- **THEN** aparece un elemento, no cuatro

### Requirement: Eliminar un producto arrastra su estructura

Eliminar un producto SHALL eliminar sus medidas, sus unidades, sus tarifas, sus variantes y sus
accesorios, y SHALL desvincularlo de su ubicación y de las listas de precios.

El sistema SHALL impedir la eliminación cuando alguna de sus unidades esté comprometida en una
cotización o un pedido en curso.

#### Scenario: No se elimina con unidades comprometidas

- **GIVEN** un producto con una unidad reservada en una cotización vigente
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza indicando qué lo compromete

#### Scenario: La eliminación alcanza a los hijos

- **GIVEN** un producto con dos variantes y un accesorio, sin compromisos
- **WHEN** se elimina
- **THEN** los tres hijos desaparecen con él

### Requirement: Datos de una medida

Una medida SHALL pertenecer a un producto y SHALL registrar su nombre, su tipo —caja, sobre,
vestuario, accesorio u otro—, sus dimensiones, su peso, sus unidades de longitud y de masa, y una
diferencia de precio propia.

Las unidades de longitud admitidas SHALL ser centímetro, metro, pulgada y pie. Las de masa SHALL ser
gramo, kilogramo, libra y onza.

#### Scenario: Se registran dimensiones con sus unidades

- **WHEN** se crea una medida con dimensiones en pulgadas y peso en libras
- **THEN** se conservan tanto los valores como sus unidades

### Requirement: Ficha de sastrería en las medidas de vestuario

Una medida de tipo vestuario SHALL poder registrar el tipo de prenda, la talla y el conjunto
completo de medidas corporales previsto.

Todas las medidas corporales SHALL ser opcionales, de modo que se registre sólo lo pertinente para
la prenda.

#### Scenario: Se registra sólo lo pertinente

- **WHEN** se crea una medida de vestuario para un pantalón indicando cintura, cadera y largo
- **THEN** se guarda lo indicado
- **AND** los campos no aplicables quedan vacíos sin producir error

### Requirement: Crear una medida puede crear existencias

Al crear una medida SHALL poder indicarse una cantidad inicial, y el sistema SHALL crear ese número
de unidades disponibles para ella.

#### Scenario: La cantidad inicial materializa unidades

- **WHEN** se crea una medida indicando una cantidad inicial de ocho
- **THEN** existen ocho unidades disponibles para esa medida

#### Scenario: Sin cantidad no se crean unidades

- **WHEN** se crea una medida sin indicar cantidad
- **THEN** la medida existe con cero unidades

### Requirement: Eliminar una medida arrastra sus unidades

Eliminar una medida SHALL eliminar sus unidades, y SHALL rechazarse cuando alguna esté comprometida
en una cotización o un pedido en curso.

#### Scenario: Una medida comprometida no se elimina

- **GIVEN** una medida con unidades reservadas
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza

### Requirement: Listas de precios por almacén

Un almacén SHALL poder definir varias listas de precios con nombre y descripción, y un producto
SHALL poder figurar en varias.

#### Scenario: Un producto figura en dos listas

- **GIVEN** dos listas de precios de un almacén
- **WHEN** se añade el mismo producto a ambas con tarifas distintas
- **THEN** cada lista conserva su propia tarifa para ese producto

### Requirement: Tarifa de un producto en una lista

Una tarifa SHALL registrar el precio de venta y, para la renta, un precio que puede ser fijo o
variar por día, semana y mes.

SHALL registrar además una penalización, igualmente fija o por periodicidad, aplicable cuando el
equipo no se devuelva en las condiciones acordadas.

#### Scenario: Se define una tarifa de renta por periodicidad

- **WHEN** se define una tarifa con precios distintos por día, semana y mes
- **THEN** los tres se conservan
- **AND** la cotización usará el que corresponda a su frecuencia

#### Scenario: Una tarifa fija ignora la periodicidad

- **GIVEN** una tarifa de renta marcada como fija
- **WHEN** se cotiza con cualquier frecuencia
- **THEN** se usa el importe fijo

### Requirement: Precedencia al resolver el precio

Al resolver el precio de una medida, el sistema SHALL aplicar la precedencia declarada: primero la
tarifa de la lista de precios aplicable, después el precio escalar del producto para la venta, y
cero como último recurso.

La diferencia de precio propia de la medida SHALL aplicarse como ajuste sobre el precio resuelto.

#### Scenario: La tarifa de la lista tiene precedencia

- **GIVEN** un producto con precio escalar y una tarifa en la lista aplicable
- **WHEN** se resuelve su precio de venta
- **THEN** se usa el de la tarifa

#### Scenario: Sin tarifa se usa el precio del producto

- **GIVEN** un producto con precio escalar y sin tarifa en ninguna lista aplicable
- **WHEN** se resuelve su precio de venta
- **THEN** se usa el precio escalar

#### Scenario: Sin ninguno de los dos el precio es cero

- **GIVEN** un producto sin tarifa y sin precio escalar
- **WHEN** se resuelve su precio
- **THEN** es cero
- **AND** la interfaz advierte de que el producto no tiene precio

### Requirement: Asignación masiva de productos a una lista

El sistema SHALL permitir establecer, de una vez, el conjunto de productos que pertenecen a una
lista de precios.

SHALL añadir los que falten y **retirar los que sobren** respecto del conjunto indicado. La
implementación anterior calculaba altas y bajas con el mismo criterio, de modo que las bajas nunca
se ejecutaban (ver `DEFECTS.md` L-04).

#### Scenario: Retirar un producto de la lista surte efecto

- **GIVEN** una lista con los productos A, B y C
- **WHEN** se establece el conjunto a A y D
- **THEN** B y C dejan de pertenecer a la lista
- **AND** D pasa a pertenecer
- **AND** A permanece

### Requirement: Eliminar una lista no borra los productos

Eliminar una lista de precios SHALL eliminar sus tarifas y no SHALL afectar a los productos.

El sistema SHALL advertir cuando la lista esté referenciada por cotizaciones en curso.

#### Scenario: Los productos sobreviven a la lista

- **GIVEN** una lista con veinte productos
- **WHEN** se elimina la lista
- **THEN** los veinte productos siguen existiendo
- **AND** sus tarifas en esa lista desaparecen

### Requirement: Clasificación doble del producto

Un producto SHALL poder clasificarse tanto en una categoría propia de su almacén como en una
categoría de la taxonomía global.

La categoría del almacén SHALL usarse para navegar el catálogo interno y la tienda pública; la
global SHALL usarse para agregaciones entre empresas.

#### Scenario: Se clasifica en ambas taxonomías

- **WHEN** se asigna a un producto una categoría de su almacén y una global
- **THEN** ambas se conservan y son independientes

### Requirement: Publicación del producto en la tienda

Un producto SHALL poder marcarse como publicado y SHALL tener un identificador legible único, para
aparecer en la tienda pública del almacén.

Un producto no publicado no SHALL ser visible desde superficies públicas.

#### Scenario: Un producto despublicado desaparece de la tienda

- **GIVEN** un producto publicado y visible en la tienda
- **WHEN** se despublica
- **THEN** deja de aparecer en el catálogo público
- **AND** solicitarlo directamente devuelve `404`

### Requirement: Disponibilidad para venta y para renta

Un producto SHALL indicar de forma independiente si está disponible para venta y si lo está para
renta, y la tienda pública SHALL respetar ambos indicadores.

Un producto no disponible para ninguna de las dos modalidades no SHALL poder añadirse a un carrito.

#### Scenario: Un producto sólo de renta no se vende

- **GIVEN** un producto disponible para renta y no para venta
- **WHEN** un comprador intenta añadirlo al carrito como compra
- **THEN** la operación se rechaza

### Requirement: Búsqueda y filtrado del catálogo

El catálogo de un almacén SHALL poder buscarse por nombre, descripción, identificador legible y
código identificativo, y filtrarse por categoría, ubicación, lista de precios, disponibilidad y
estado de publicación.

Filtrar por una categoría SHALL incluir sus descendientes, según `query-and-pagination`.

#### Scenario: Se busca por código identificativo

- **WHEN** se busca el código identificativo de un producto
- **THEN** ese producto aparece en los resultados

### Requirement: Vista de detalle con su estructura

El detalle de un producto SHALL presentar sus medidas con la disponibilidad de cada una, sus
tarifas por lista, sus unidades, su ubicación, sus variantes y sus accesorios.

#### Scenario: El detalle muestra la disponibilidad por medida

- **WHEN** se abre el detalle de un producto con tres medidas
- **THEN** cada medida muestra cuántas unidades tiene en cada estado
