# Eventos del procesador de pagos

## Purpose

El procesador de pagos es la fuente de verdad sobre el dinero, y comunica lo que ocurre mediante
eventos entrantes: se completó un pago, se cobró una factura, falló un cargo, cambió una
suscripción, se verificó una cuenta de comercio.

Esos eventos disparan casi todo lo que importa: se materializan pedidos, se activan suscripciones,
se bloquean empresas. Por eso este endpoint es, con diferencia, **la superficie más sensible del
sistema**.

En la implementación anterior estaba completamente abierta: el manejador **generaba su propia firma**
en lugar de verificar la del remitente, de modo que cualquiera podía publicar un evento falsificado
y provocar una alta de suscripción o la materialización de un pedido no pagado
(ver `DEFECTS.md` S-01). Ese es el defecto más grave encontrado en todo el levantamiento.

### Eventos atendidos

| Evento | Efecto |
|---|---|
| Sesión de pago completada | Según su tipo: activa una suscripción, o materializa un pedido de tienda |
| Sesión de pago caducada | Libera las existencias reservadas y marca el checkout como caducado |
| Factura cobrada | Registra el cobro, sincroniza el estado y los asientos |
| Factura próxima | Avisa al titular |
| Fallo de cobro de factura | Inicia el periodo de gracia |
| Suscripción modificada | Sincroniza plan, cantidad, periodicidad y periodo |
| Suscripción terminada | Cierra la suscripción |
| Cuenta de comercio actualizada | Sincroniza capacidades y estado de verificación |
| Cargo reembolsado | Registra el reembolso y ajusta el pedido |
| Disputa abierta | Registra la disputa y avisa |

## Requirements

### Requirement: La firma del remitente se verifica

El sistema SHALL verificar la firma de cada evento entrante usando la firma que acompaña a la
petición y el secreto compartido con el procesador, y SHALL rechazar con `400` todo evento cuya
firma no valide.

La verificación SHALL realizarse sobre el **cuerpo sin procesar** de la petición, tal cual se
recibió.

En ningún caso SHALL el sistema generar la firma que después verifica.

#### Scenario: Un evento sin firma se rechaza

- **WHEN** se recibe un evento sin la firma del procesador
- **THEN** la respuesta es `400`
- **AND** no se produce ningún efecto

#### Scenario: Una firma que no corresponde se rechaza

- **WHEN** se recibe un evento cuyo cuerpo fue alterado tras firmarse
- **THEN** la verificación falla
- **AND** la respuesta es `400`

#### Scenario: Un evento falsificado no activa una suscripción

- **WHEN** un tercero publica un evento de sesión completada con datos de una empresa real
- **THEN** se rechaza por firma inválida
- **AND** la empresa sigue sin suscripción

### Requirement: La firma tiene ventana temporal

El sistema SHALL rechazar eventos cuya marca de tiempo firmada quede fuera de una ventana de
tolerancia, para impedir la reproducción de eventos capturados.

#### Scenario: Un evento reproducido tiempo después se rechaza

- **GIVEN** un evento legítimo capturado y reproducido pasado el margen de tolerancia
- **WHEN** se recibe
- **THEN** se rechaza

### Requirement: Cada evento se procesa una sola vez

El sistema SHALL registrar el identificador de cada evento procesado y SHALL descartar los
duplicados sin repetir sus efectos.

El procesador reintenta la entrega ante cualquier respuesta que no sea de éxito, de modo que sin
esta garantía un reintento duplicaría pedidos, pagos y movimientos de inventario
(ver `DEFECTS.md` M-03).

#### Scenario: Un reintento no duplica el efecto

- **GIVEN** un evento de sesión completada ya procesado que materializó un pedido
- **WHEN** el procesador lo reenvía
- **THEN** se responde con éxito
- **AND** no se crea un segundo pedido

#### Scenario: Dos entregas simultáneas producen un solo efecto

- **WHEN** el mismo evento llega dos veces a la vez
- **THEN** sólo una de las dos ejecuta los efectos
- **AND** ambas responden con éxito

### Requirement: Los efectos de un evento son transaccionales

Todos los cambios de estado derivados de un evento SHALL confirmarse de forma atómica: o se aplican
todos, o no se aplica ninguno.

Cuando el procesamiento falle a mitad, el sistema SHALL responder con error para que el procesador
reintente, y no SHALL dejar estado parcial.

#### Scenario: Un fallo a mitad no deja estado parcial

- **GIVEN** un evento cuya materialización falla después de crear parte de las entidades
- **WHEN** se revierte
- **THEN** no queda ninguna de ellas
- **AND** la respuesta indica error para provocar el reintento

### Requirement: Un evento desconocido se acepta sin actuar

El sistema SHALL responder con éxito a un evento de un tipo que no atiende, sin producir efectos y
dejando constancia de que se recibió.

Responder con error provocaría reintentos indefinidos y, con el tiempo, la desactivación del
endpoint por parte del procesador.

#### Scenario: Un tipo no atendido no provoca reintentos

- **WHEN** se recibe un evento de un tipo que el sistema no atiende
- **THEN** la respuesta es de éxito
- **AND** no se produce ningún efecto
- **AND** queda registro de haberlo recibido

### Requirement: La recepción es rápida y el trabajo se encola

El sistema SHALL confirmar la recepción del evento dentro del plazo que el procesador admite, y
SHALL realizar en segundo plano el trabajo que no quepa en ese plazo.

El trabajo encolado SHALL conservar la garantía de ejecutarse una sola vez y SHALL reintentarse ante
fallos transitorios.

#### Scenario: Una materialización larga no agota el plazo

- **GIVEN** un evento cuya materialización requiere más tiempo del plazo de respuesta
- **WHEN** se recibe
- **THEN** se confirma la recepción dentro del plazo
- **AND** el trabajo se completa en segundo plano

### Requirement: Sesión de pago completada

Al recibirse una sesión de pago completada, el sistema SHALL determinar su tipo a partir de los
metadatos de la sesión y SHALL derivarla al flujo correspondiente: activación de suscripción, o
materialización de un pedido de tienda de almacén o de tienda de mosaicos.

Una sesión sin tipo reconocible SHALL registrarse como incidencia sin producir efectos.

#### Scenario: Una suscripción se activa

- **WHEN** se completa una sesión de tipo suscripción
- **THEN** la empresa indicada queda con su suscripción activa y vinculada

#### Scenario: Una compra se materializa

- **WHEN** se completa una sesión de tipo tienda
- **THEN** se materializa el pedido según `order-fulfillment`

#### Scenario: Un tipo irreconocible se registra como incidencia

- **WHEN** se completa una sesión sin tipo reconocible en sus metadatos
- **THEN** no se produce ningún efecto
- **AND** queda registrada como incidencia para revisión

### Requirement: Sesión de pago caducada

Al caducar una sesión de pago sin completarse, el sistema SHALL marcar el checkout como caducado y
SHALL liberar las existencias que hubiese reservado.

Sin este manejador, las unidades reservadas quedarían bloqueadas indefinidamente
(ver `DEFECTS.md` M-10).

#### Scenario: Caducar libera el inventario

- **GIVEN** un checkout pendiente con tres unidades reservadas
- **WHEN** su sesión de pago caduca
- **THEN** el checkout queda marcado como caducado
- **AND** las tres unidades vuelven a estar disponibles

### Requirement: Factura cobrada

Al cobrarse una factura de suscripción, el sistema SHALL registrar el cobro con su importe, periodo
y número de asientos, SHALL sincronizar el estado de la suscripción y SHALL avisar al titular.

La sincronización de asientos SHALL conservar los descuentos aplicados (ver `DEFECTS.md` M-07).

#### Scenario: El cobro deja registro y reactiva

- **GIVEN** una suscripción en pago pendiente
- **WHEN** se cobra su factura
- **THEN** queda registrado el cobro
- **AND** la suscripción vuelve a estar activa
- **AND** el titular recibe el aviso

### Requirement: Fallo de cobro de factura

Al fallar el cobro de una factura, el sistema SHALL pasar la suscripción a pago pendiente, SHALL
iniciar el periodo de gracia y SHALL avisar al titular.

La suscripción no SHALL eliminarse (ver `DEFECTS.md` M-08).

#### Scenario: El fallo no elimina la suscripción

- **GIVEN** una suscripción activa
- **WHEN** falla el cobro de su factura
- **THEN** la suscripción sigue existiendo en pago pendiente
- **AND** la empresa conserva el acceso durante la gracia

### Requirement: Suscripción modificada o terminada

Al comunicarse un cambio en una suscripción, el sistema SHALL sincronizar su estado, su marca de
cancelación al vencimiento, su plan, su número de asientos, su periodicidad y su periodo.

Al comunicarse su terminación, SHALL cerrarla y desvincularla de la empresa, conservando su
historial de cobros.

#### Scenario: Un cambio de plan se refleja

- **WHEN** se comunica que la suscripción pasó a otro plan
- **THEN** la suscripción local apunta al plan correspondiente del catálogo

#### Scenario: La terminación conserva el historial

- **WHEN** se comunica la terminación de una suscripción
- **THEN** la empresa queda sin suscripción vigente
- **AND** sus cobros anteriores siguen consultables

### Requirement: Cuenta de comercio actualizada

Al comunicarse un cambio en una cuenta de comercio, el sistema SHALL localizar el perfil de
facturación correspondiente y SHALL sincronizar sus capacidades y su estado, según lo establecido
en `merchant-onboarding`.

#### Scenario: La verificación completa activa el perfil

- **WHEN** se comunica que la cuenta acepta cargos y no tiene requisitos pendientes
- **THEN** el perfil pasa a activo

### Requirement: Reembolsos y disputas

El sistema SHALL atender los eventos de reembolso y de disputa, registrando el movimiento, ajustando
el estado del pago y del pedido afectados, y avisando a la empresa vendedora.

Estos manejadores no existían, pese a que los estados correspondientes sí estaban previstos en el
modelo (ver `DEFECTS.md` M-09).

#### Scenario: Un reembolso ajusta el pedido

- **WHEN** se comunica el reembolso de un cargo
- **THEN** el pago pasa a reembolsado
- **AND** el pedido asociado refleja el reembolso
- **AND** la empresa vendedora recibe el aviso

#### Scenario: Una disputa queda registrada

- **WHEN** se comunica la apertura de una disputa
- **THEN** queda registrada contra el pago afectado
- **AND** la empresa vendedora recibe el aviso

### Requirement: Trazabilidad de los eventos recibidos

El sistema SHALL conservar un registro de cada evento recibido con su identificador, su tipo, su
instante, el resultado de su verificación y el de su procesamiento.

Un administrador de plataforma SHALL poder consultar ese registro y reprocesar manualmente un evento
fallido.

#### Scenario: Se puede reprocesar un evento fallido

- **GIVEN** un evento cuyo procesamiento falló de forma persistente
- **WHEN** un administrador de plataforma lo reprocesa
- **THEN** se ejecutan sus efectos
- **AND** la garantía de una sola ejecución sigue vigente
