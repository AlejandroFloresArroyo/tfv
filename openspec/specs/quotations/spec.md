# Cotizaciones

## Purpose

El documento comercial del servicio de almacenes: qué equipo, para cuándo, a qué precio y bajo qué
condiciones. Es lo que el cliente recibe, aprueba y a veces firma, así que es un documento con
consecuencias contractuales, no una vista interna.

Una cotización reúne cuatro bloques que se editan por separado porque los gestionan personas
distintas:

| Bloque | Contenido | Quién lo toca |
|---|---|---|
| Identidad | Folio, nombre, fechas, contactos, términos, observaciones | Quien atiende al cliente |
| Líneas | Qué equipo, cuánto, con qué tarifa y frecuencia | Quien conoce el inventario |
| Condiciones de pago | Anticipos, depósitos, descuentos, comisiones, penalizaciones | Quien negocia |
| Impuestos | IVA, ISR, retenciones y contribuciones adicionales | Administración |

El cálculo de los importes se especifica aparte, en `quotation-pricing`, porque es sustancial por sí
solo. El efecto sobre el inventario se especifica en `stock-reservation`.

### Estados

| Estado | Significado |
|---|---|
| Pre-cotización | Borrador antes de tener líneas |
| Pendiente | Enviada al cliente, esperando respuesta |
| En progreso | Aceptada, en preparación |
| En renta | El equipo está fuera |
| Completada | El servicio se prestó |
| Vendida | Cerrada como venta |
| Cancelada | Terminada sin efecto |

## Requirements

### Requirement: Identidad de una cotización

Una cotización SHALL pertenecer a un almacén y SHALL registrar un folio, un nombre, una descripción,
un código identificativo único, su responsable, su cliente y su tipo —renta o venta—.

SHALL poder registrar además un mensaje para el cliente, un aviso destacado, los términos y las
observaciones.

#### Scenario: Se crea una cotización con lo mínimo

- **WHEN** se crea una cotización indicando almacén, cliente y tipo
- **THEN** queda registrada con folio y código identificativo únicos
- **AND** su responsable es quien la creó si no se indicó otro

### Requirement: Una cotización nace en el estado que corresponde

Una cotización creada **con líneas** SHALL nacer en progreso; creada **sin líneas** SHALL nacer
pendiente.

#### Scenario: Con líneas nace en progreso

- **WHEN** se crea una cotización aportando sus líneas
- **THEN** su estado es en progreso

#### Scenario: Sin líneas nace pendiente

- **WHEN** se crea una cotización sin líneas
- **THEN** su estado es pendiente

### Requirement: Ventana de renta

Una cotización de renta SHALL registrar la fecha de inicio y la de fin del periodo, y SHALL poder
indicar si los días se redondean y en qué dirección.

Una cotización de venta no SHALL exigir ventana de fechas.

#### Scenario: Una renta sin fechas no se puede cerrar

- **GIVEN** una cotización de renta sin fechas
- **WHEN** se intenta pasar a en progreso
- **THEN** la operación se rechaza indicando que faltan las fechas

#### Scenario: Una venta no exige fechas

- **WHEN** se crea y se avanza una cotización de venta sin ventana de fechas
- **THEN** la operación se completa

### Requirement: Contactos de ambas partes

Una cotización SHALL poder registrar varios contactos por el lado del cliente y varios por el lado
del vendedor, cada uno con nombre, teléfono y cargo.

#### Scenario: Se registran contactos de las dos partes

- **WHEN** se añaden dos contactos del cliente y uno del vendedor
- **THEN** los tres se conservan diferenciados por su lado

### Requirement: Líneas de cotización

Una línea SHALL referenciar una medida de producto, SHALL indicar su cantidad, la lista de precios
aplicable y, para renta, su frecuencia de cobro.

La cantidad de una línea SHALL determinarse por el número de unidades reservadas, según
`stock-reservation`.

#### Scenario: Una línea referencia una medida

- **WHEN** se añade una línea indicando una medida y una cantidad de tres
- **THEN** la línea queda registrada con tres unidades reservadas

### Requirement: Reconciliación completa de las líneas

El sistema SHALL permitir establecer de una vez el conjunto completo de líneas de una cotización,
creando las nuevas, actualizando las existentes y eliminando las ausentes.

La operación SHALL ser atómica y SHALL reconciliar las reservas de inventario en consecuencia.

#### Scenario: Se establece el conjunto de líneas

- **GIVEN** una cotización con las líneas A, B y C
- **WHEN** se establece el conjunto a A con otra cantidad, y D
- **THEN** A queda actualizada con su nueva cantidad
- **AND** B y C se eliminan y liberan sus unidades
- **AND** D se crea con sus unidades reservadas

#### Scenario: Un fallo deja las líneas como estaban

- **GIVEN** una reconciliación que falla por existencia insuficiente en una línea
- **WHEN** se revierte
- **THEN** las líneas de la cotización siguen siendo las de antes
- **AND** las reservas no han cambiado

### Requirement: Orden de presentación de líneas y productos

Una cotización SHALL conservar el orden en que sus líneas y sus productos deben presentarse, y ese
orden SHALL respetarse en la interfaz y en el documento generado.

El orden SHALL poder modificarse sin alterar ningún otro dato de la cotización.

#### Scenario: Reordenar no altera los importes

- **WHEN** se cambia el orden de presentación de las líneas
- **THEN** los importes de la cotización no cambian
- **AND** el documento generado refleja el orden nuevo

### Requirement: Condiciones de pago

Una cotización SHALL poder registrar conceptos adicionales con su importe, comisiones por
transferencia y adicionales, anticipos y depósitos con su importe, método y fecha, un precio fijo
que sustituya al calculado, descuentos globales o por producto, y penalizaciones.

SHALL poder indicar si las comisiones se reparten entre las líneas en lugar de mostrarse aparte.

#### Scenario: Se registra un anticipo

- **WHEN** se indica un anticipo con su importe, método y fecha
- **THEN** se conserva
- **AND** el total a pagar lo descuenta

### Requirement: Bloque de impuestos

Una cotización SHALL poder registrar IVA con su tipo y contexto, ISR con su tipo y contexto,
retenciones de ambos, y contribuciones adicionales expresadas como porcentaje o como importe.

Cada impuesto SHALL poder activarse o desactivarse de forma independiente y SHALL registrar su
concepto.

#### Scenario: Se activa el IVA con su contexto

- **WHEN** se activa el IVA indicando su porcentaje, tipo y contexto
- **THEN** se conserva
- **AND** el cálculo lo aplica según `quotation-pricing`

#### Scenario: Un impuesto desactivado no se aplica

- **GIVEN** una cotización con un porcentaje de ISR registrado pero desactivado
- **WHEN** se calculan los importes
- **THEN** el ISR no interviene

### Requirement: Transiciones de estado permitidas

El sistema SHALL admitir únicamente las transiciones de estado previstas y SHALL rechazar el resto
con `409`.

Una cotización en estado cerrado —completada, vendida o cancelada— no SHALL volver a un estado
abierto.

#### Scenario: No se reabre una cotización cerrada

- **GIVEN** una cotización completada
- **WHEN** se intenta pasar a en progreso
- **THEN** la respuesta es `409`

#### Scenario: Una transición prevista se acepta

- **GIVEN** una cotización pendiente
- **WHEN** pasa a en progreso
- **THEN** la operación se completa
- **AND** sus unidades quedan en cotización

### Requirement: Cambiar de estado mueve el inventario

Todo cambio de estado de una cotización SHALL proyectarse sobre sus unidades reservadas conforme a
`stock-reservation`, en la misma transacción.

#### Scenario: El cambio de estado y el inventario van juntos

- **GIVEN** una cotización en progreso con unidades reservadas
- **WHEN** se cancela
- **THEN** el estado y la liberación de las unidades se confirman juntos
- **AND** si algo falla, ni el estado ni las unidades cambian

### Requirement: Prioridad derivada del estado

Una cotización SHALL exponer una prioridad de presentación derivada de su estado, mayor cuanto más
temprano sea, y ligeramente superior cuando esté vinculada a un pedido.

Los listados SHALL ordenarse por prioridad descendente por defecto.

#### Scenario: Lo más urgente aparece primero

- **GIVEN** una cotización pendiente y otra completada
- **WHEN** se listan
- **THEN** la pendiente aparece antes

#### Scenario: Una cotización con pedido gana precedencia

- **GIVEN** dos cotizaciones en el mismo estado, una vinculada a un pedido
- **WHEN** se listan
- **THEN** la vinculada aparece antes

### Requirement: Firmas del cliente y del responsable

Una cotización SHALL poder registrar la firma del cliente y la del responsable, capturadas según
`forms-and-wizards`.

Una firma registrada no SHALL poder modificarse ni eliminarse, y SHALL aparecer en el documento
generado.

#### Scenario: La firma queda fija

- **GIVEN** una cotización firmada por el cliente
- **WHEN** se abre de nuevo
- **THEN** la firma se muestra y no puede alterarse

### Requirement: Registro de pago contra la cotización

El sistema SHALL permitir registrar el pago de una cotización con su importe, método, descripción,
quién lo registró y los comprobantes adjuntos.

#### Scenario: Se registra un pago con comprobante

- **WHEN** se registra un pago aportando importe, método y un comprobante
- **THEN** queda asociado a la cotización
- **AND** el comprobante es consultable

### Requirement: Documento y enlace público

Una cotización SHALL poder generarse como documento según `pdf-documents`, y SHALL poder compartirse
mediante un enlace público de sólo lectura.

#### Scenario: El cliente abre la cotización sin cuenta

- **WHEN** se comparte el enlace de una cotización
- **THEN** el destinatario ve el documento sin autenticarse
- **AND** no puede modificarlo

### Requirement: Eliminación de una cotización

Eliminar una cotización SHALL liberar sus reservas conforme a `stock-reservation`, eliminar sus
líneas y desvincularla del pedido que la originó, conservando sus firmas y sus pagos como historial.

El sistema SHALL impedir eliminar una cotización con equipo rentado sin devolver.

#### Scenario: No se elimina con equipo fuera

- **GIVEN** una cotización de renta con unidades rentadas
- **WHEN** se intenta eliminar
- **THEN** la operación se rechaza indicando que hay equipo pendiente de retorno

### Requirement: Búsqueda y filtrado de cotizaciones

Las cotizaciones de un almacén SHALL poder buscarse por nombre, descripción y folio, y filtrarse por
estado, tipo, cliente, responsable y rango de fechas.

#### Scenario: Se busca por folio

- **WHEN** se busca el folio de una cotización
- **THEN** aparece en los resultados
