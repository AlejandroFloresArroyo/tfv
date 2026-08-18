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

### Requirement: La composición de las líneas se congela al salir el equipo

Mientras el equipo de una cotización de renta esté fuera de la nave —en renta, o completada con
unidades sin devolver—, el sistema NO SHALL admitir altas, bajas ni cambios de cantidad o de medida
en sus líneas.

SÍ SHALL admitir cambios de **precio y periodicidad**: no mueven inventario.

El equipo vuelve **registrando su retorno**, que es la única operación que sabe en qué condiciones
volvió cada unidad.

> No es una regla de documento sino de inventario. Soltar una reserva devuelve a disponible
> únicamente lo que estaba **apartado**: bajar una cantidad con el equipo fuera liberaría el vínculo
> y dejaría la unidad rentada **sin dueño**, comprometida indefinidamente y sin nadie a quien
> reclamarla. Cambiar lo que cuesta una línea no toca nada de eso — y hace falta poder hacerlo,
> porque una **extensión de renta** nace con el equipo ya fuera y sin esto no tendría precio nunca.

#### Scenario: Una renta en curso no admite cambios de cantidad

- **GIVEN** una cotización en renta con tres unidades fuera
- **WHEN** se intenta bajar la cantidad de su línea a una
- **THEN** se rechaza
- **AND** las tres unidades siguen rentadas

#### Scenario: Tampoco admite añadir equipo

- **GIVEN** la misma cotización
- **WHEN** se intenta añadir una línea
- **THEN** se rechaza y no se aparta nada

#### Scenario: El precio sí se ajusta con el equipo fuera

- **GIVEN** la misma cotización
- **WHEN** se cambia el precio negociado y la periodicidad de su línea, sin tocar la cantidad
- **THEN** se acepta
- **AND** el equipo sigue donde estaba

#### Scenario: Mientras el equipo no ha salido sí se editan

- **GIVEN** una cotización en progreso con tres unidades apartadas
- **WHEN** se baja la cantidad de su línea a una
- **THEN** se acepta y dos unidades vuelven a disponible

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

Un cambio de estado que devolvería unidades a disponible NO SHALL aceptarse mientras haya equipo
sin devolver: primero se registra el retorno.

> Cancelar proyecta el inventario a disponible. Con el equipo en la calle, eso escribe en el sistema
> que hay cámaras en el estante que no están, y nadie lo nota hasta que alguien va a buscarlas. Es
> la misma guarda que ya protegía la eliminación de la cotización.

#### Scenario: El cambio de estado y el inventario van juntos

- **GIVEN** una cotización en progreso con unidades reservadas
- **WHEN** se cancela
- **THEN** el estado y la liberación de las unidades se confirman juntos
- **AND** si algo falla, ni el estado ni las unidades cambian

#### Scenario: No se cancela con el equipo fuera

- **GIVEN** una cotización en renta con tres unidades sin devolver
- **WHEN** se intenta cancelar
- **THEN** se rechaza nombrando cuántas unidades faltan
- **AND** las tres siguen rentadas

#### Scenario: Cancelar es posible en cuanto vuelve todo

- **GIVEN** la misma cotización con su retorno ya registrado
- **WHEN** se cancela
- **THEN** se acepta

### Requirement: Extensión de una renta

Una renta con equipo fuera SHALL poder extenderse creando una **cotización nueva enlazada** a la
original, con su propia ventana.

La extensión SHALL recibir los **vínculos vivos** de las unidades que continúan, sin que esas
unidades pasen por disponible en ningún momento. Las unidades que no continúen SHALL quedarse con la
renta original para su retorno.

SHALL poder ser **parcial** y SHALL ser **encadenable**: una extensión se extiende igual que una
renta.

La extensión SHALL nacer en renta, y NO SHALL heredar el precio negociado de las líneas ni las
condiciones de pago de la original.

> Nace en renta, y no en borrador, porque **la cantidad de una línea es cuántas unidades sujeta**:
> una extensión en borrador sin vínculos vale cero y no se puede negociar un precio que no se ve. Y
> con los vínculos ya traspasados, un estado abierto proyectaría «en cotización» mientras las
> unidades están rentadas, de modo que la verificación de coherencia la marcaría con razón.
>
> El precio negociado es «el total de la línea para el periodo completo». Arrastrar el importe de
> dos semanas a una extensión de un mes sería cobrar mal y parecer que alguien lo decidió.

#### Scenario: Los vínculos se traspasan sin soltar el equipo

- **GIVEN** una renta en curso con tres unidades fuera
- **WHEN** se extiende nombrando las tres
- **THEN** la extensión queda en renta, enlazada a la original
- **AND** las tres siguen rentadas y ahora responden a la extensión
- **AND** la original se queda sin equipo que reclamar

#### Scenario: Una extensión parcial deja el resto con la original

- **GIVEN** una renta en curso con cuatro unidades fuera
- **WHEN** se extiende nombrando dos
- **THEN** la extensión reclama dos y la original las otras dos
- **AND** las cuatro siguen fuera

#### Scenario: Una extensión se extiende

- **GIVEN** una extensión en curso
- **WHEN** se extiende a su vez
- **THEN** la segunda queda enlazada a la primera

#### Scenario: No se extiende lo que no salió

- **GIVEN** una renta en curso
- **WHEN** se intenta extender nombrando una unidad de otra cotización
- **THEN** se rechaza

#### Scenario: No se adelanta una renta que no ha salido

- **GIVEN** una cotización con equipo apartado pero dentro de la nave
- **WHEN** se intenta extender
- **THEN** se rechaza

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

Lo cobrado SHALL contarse **aparte del anticipo pactado**: el anticipo mueve el total del documento
y lo cobrado mueve el **saldo**, que SHALL calcularse como el bruto menos lo cobrado.

Una cotización **cerrada** SHALL seguir admitiendo cobro, y su saldo SHALL recalcularse aunque sus
importes estén congelados.

> El saldo se cuenta desde el bruto y no desde el total porque el total ya descontó el anticipo
> pactado: descontar además lo cobrado contaría dos veces el mismo dinero en cuanto ese anticipo se
> cobre, que es el caso normal. Cuando se cobra y se registra, saldo y total coinciden.

#### Scenario: Se registra un pago con comprobante

- **WHEN** se registra un pago aportando importe, método y un comprobante
- **THEN** queda asociado a la cotización
- **AND** el comprobante es consultable

> **Incumplido a propósito.** El registro entra sin comprobantes porque no existe todavía
> almacenamiento de ficheros; la tabla está en el esquema esperándolo. Se decidió que entrara antes:
> llevar la cuenta a mano mientras tanto es peor que llevarla sin el papel escaneado. Este escenario
> se cumple con la rebanada de medios.

#### Scenario: Pactar no es cobrar

- **GIVEN** una cotización de `1000.00` con un anticipo pactado de `300.00`
- **WHEN** nadie ha pagado todavía
- **THEN** el total a pagar es `700.00`
- **AND** el saldo es `1000.00`

#### Scenario: El cobro mueve el saldo y no el total

- **GIVEN** la misma cotización
- **WHEN** se registra un cobro de `300.00`
- **THEN** el total a pagar sigue siendo `700.00`
- **AND** el saldo pasa a `700.00`

#### Scenario: Una cotización cerrada se sigue cobrando

- **GIVEN** una cotización cerrada con sus importes congelados
- **WHEN** se registra un cobro
- **THEN** se acepta
- **AND** el saldo se recalcula aunque el resto de importes no se muevan

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
