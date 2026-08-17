# Documentos generados

## Purpose

Seis familias de documentos que el sistema produce a partir de sus propios datos, para imprimir,
descargar o compartir por enlace con alguien que no tiene cuenta. Algunos son documentos
comerciales que un cliente firma, así que su contenido tiene consecuencias.

| Documento | Origen | Para quién |
|---|---|---|
| Cotización | Cotización de almacén con sus líneas, impuestos y condiciones | El cliente, que la aprueba y a veces la firma |
| Nota de entrega | Nota de entrega de producción con sus artículos y firmas | Quien entrega y quien recibe |
| Presupuesto | Anclas y compras de una producción, con su diferencia | Dirección de producción |
| Plan de trabajo | Plan con sus tareas agrupadas por semana | El equipo de rodaje |
| Recibo de venta | Venta de mostrador de Pixit con su desglose | El comprador |
| Instructivo de armado | Un mosaico vendido: una página por lámina, con su leyenda de colores | El comprador, que lo sigue para armar |

El instructivo de armado es el más singular: **es el producto en sí**, no un comprobante. Sin él, el
cliente no puede montar el mosaico que compró.

Esta capability describe **qué contiene cada documento y cómo se accede a él**. Dónde se renderiza
—navegador o servidor— es una decisión de implementación abierta; los requisitos están escritos para
no depender de ella.

## Requirements

### Requirement: Previsualizar, imprimir y descargar

Cada documento SHALL poder previsualizarse en pantalla, enviarse a imprimir y descargarse como
archivo, desde la misma superficie y a partir de los mismos datos.

El nombre del archivo descargado SHALL identificar el documento y el instante de generación.

#### Scenario: Las tres acciones producen el mismo contenido

- **WHEN** se previsualiza, se imprime y se descarga el mismo documento
- **THEN** las tres representaciones tienen idéntico contenido y disposición

#### Scenario: El nombre del archivo identifica el documento

- **WHEN** se descarga la cotización de un almacén
- **THEN** el nombre del archivo permite reconocer de qué documento y de qué momento se trata

### Requirement: El documento refleja los datos vigentes

Un documento SHALL generarse a partir del estado actual de su entidad en el momento de generarlo,
salvo que la entidad tenga importes congelados, en cuyo caso SHALL usar los congelados.

#### Scenario: Una cotización cerrada conserva sus importes

- **GIVEN** una cotización completada, cuyos importes quedaron congelados
- **WHEN** cambian después los precios del catálogo
- **THEN** el documento sigue mostrando los importes con los que se cerró

#### Scenario: Una cotización abierta refleja los cambios

- **GIVEN** una cotización en curso
- **WHEN** se añade una línea y se regenera el documento
- **THEN** la línea nueva aparece y los totales se han recalculado

### Requirement: Enlace público de sólo lectura

Los documentos destinados a alguien sin cuenta —cotización, nota de entrega, recibo de venta y plan
de trabajo— SHALL ser accesibles por un enlace público que no exija autenticación.

El enlace SHALL conceder únicamente lectura del documento referido, según lo establecido en
`access-control`, y su referencia SHALL ser impredecible.

#### Scenario: Un cliente abre la cotización sin cuenta

- **WHEN** un cliente sin cuenta abre el enlace de una cotización
- **THEN** ve el documento y puede descargarlo o imprimirlo
- **AND** no ve navegación ni datos de la empresa ajenos al documento

#### Scenario: Alterar el enlace no revela otros documentos

- **WHEN** se modifica la referencia del enlace
- **THEN** la respuesta es `404`

### Requirement: Contenido de la cotización

El documento de cotización SHALL contener la identidad del documento —folio, nombre y fechas—, los
datos del emisor y del cliente, los contactos de ambas partes, las líneas agrupadas por producto,
el desglose económico completo y las condiciones de pago, los términos y las observaciones.

Las líneas SHALL presentarse en el orden que la cotización tenga establecido, y **la suma de las
líneas visibles SHALL cuadrar con el total mostrado**.

Cuando la cotización sea de renta, SHALL indicar la ventana de fechas y la frecuencia aplicada.

#### Scenario: Las líneas cuadran con el total

- **WHEN** se genera el documento de una cotización con varias líneas, descuentos e impuestos
- **THEN** los importes por línea, el subtotal, los descuentos, los impuestos y el total son coherentes entre sí

#### Scenario: Una cotización de renta indica su periodo

- **GIVEN** una cotización de tipo renta con fechas de inicio y fin
- **WHEN** se genera el documento
- **THEN** muestra la ventana de fechas y la frecuencia con la que se calculó

### Requirement: Firmas en los documentos que las llevan

La cotización y la nota de entrega SHALL poder incorporar firmas capturadas en pantalla, y SHALL
mostrarlas junto al nombre de quien firmó y la fecha.

Un documento sin firmar SHALL mostrar el espacio de firma vacío, no ocultarlo.

#### Scenario: Una nota firmada muestra ambas firmas

- **GIVEN** una nota de entrega firmada por quien entrega y por quien recibe
- **WHEN** se genera el documento
- **THEN** aparecen las dos firmas con su nombre y su fecha

#### Scenario: Un documento sin firmar deja el espacio

- **GIVEN** una cotización aún no firmada
- **WHEN** se genera el documento
- **THEN** el espacio de firma aparece vacío y disponible para firmar a mano

### Requirement: Contenido de la nota de entrega

El documento de nota de entrega SHALL listar los artículos agrupados por su estado de verificación,
distinguiendo los ya verificados de los pendientes, e indicar quién verificó cada uno y cuándo.

#### Scenario: Los artículos se agrupan por verificación

- **GIVEN** una nota con artículos verificados y pendientes
- **WHEN** se genera el documento
- **THEN** aparecen en grupos separados y claramente rotulados

### Requirement: Contenido del presupuesto

El documento de presupuesto SHALL mostrar las anclas y las compras de la producción, sus totales
respectivos y la diferencia entre ambos, distinguiendo visualmente si la diferencia es favorable o
desfavorable.

Cuando una compra se pagó con tarjeta, SHALL identificarla sin revelar el número completo.

#### Scenario: La diferencia se distingue por signo

- **GIVEN** una producción cuyo gasto supera lo presupuestado
- **WHEN** se genera el documento
- **THEN** la diferencia se presenta señalada como desfavorable

### Requirement: Contenido del plan de trabajo

El documento de plan de trabajo SHALL presentar las tareas agrupadas por semana y por día, con su
estado, su responsable y su categoría.

#### Scenario: Las tareas se agrupan por semana

- **GIVEN** un plan con tareas repartidas en dos semanas
- **WHEN** se genera el documento
- **THEN** aparecen en dos bloques semanales, cada uno con sus días

### Requirement: Contenido del recibo de venta

El recibo de una venta de mostrador SHALL mostrar el desglose de lo vendido —tableros, láminas y
ladrillos—, el subtotal, los descuentos, los impuestos, el total, el importe recibido y el cambio,
los datos de la tienda, un código legible por máquina que identifique la venta, y los términos
vigentes.

#### Scenario: El recibo cuadra con lo cobrado

- **WHEN** se genera el recibo de una venta en efectivo con cambio
- **THEN** el importe recibido menos el total es igual al cambio mostrado

### Requirement: Contenido del instructivo de armado

El instructivo de un mosaico SHALL contener una página con la vista completa del tablero y, a
continuación, **una página por lámina**, cada una con la imagen de esa lámina a tamaño de trabajo y
su leyenda de colores.

La leyenda SHALL indicar, por cada color presente en la lámina, su muestra, su nombre y **cuántas
piezas** hacen falta.

Las láminas SHALL aparecer en el orden en que se montan.

#### Scenario: Cada lámina tiene su página y su leyenda

- **GIVEN** un mosaico compuesto por seis láminas
- **WHEN** se genera el instructivo
- **THEN** contiene una página de conjunto y seis páginas de lámina
- **AND** cada página de lámina lleva la leyenda de los colores que aparecen en ella

#### Scenario: Las cantidades de la leyenda coinciden con lo vendido

- **WHEN** se suman las piezas de las leyendas de todas las láminas
- **THEN** el resultado coincide con la lista de materiales de la venta

### Requirement: Visor de guiones con lectura asistida

El sistema SHALL disponer de un visor para los guiones de producción que permita navegar por
páginas, ajustar el nivel de acercamiento y ver a pantalla completa.

El visor SHALL poder leer en voz alta el texto de la página, con voz y velocidad seleccionables, y
SHALL avanzar a la página siguiente al terminar.

#### Scenario: La lectura avanza sola

- **GIVEN** un guion abierto en el visor con la lectura en curso
- **WHEN** termina de leerse la página
- **THEN** avanza a la siguiente y continúa leyendo

#### Scenario: El acercamiento no altera la paginación

- **WHEN** se aumenta el nivel de acercamiento
- **THEN** el número de página no cambia

### Requirement: Los documentos llevan pie de identificación

Todo documento generado SHALL incluir un pie que identifique al sistema que lo produjo y la
dirección desde la que se generó.

#### Scenario: El pie aparece en todos los documentos

- **WHEN** se genera cualquiera de las seis familias de documentos
- **THEN** el pie de identificación aparece en él
