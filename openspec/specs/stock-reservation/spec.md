# Reserva de existencias

## Purpose

La máquina que une las cotizaciones con el inventario físico. Es el punto de mayor riesgo de todo el
servicio de almacenes: aquí se decide qué cámara concreta queda apartada para qué cliente, y un
error se traduce en equipo prometido dos veces o en equipo bloqueado que nadie puede rentar.

Se especifica aparte de `quotations` y de `stock-units` precisamente porque es lo que las conecta, y
porque su corrección se razona sola.

Dos mecanismos, y conviene distinguirlos:

1. **Reconciliación por cantidad.** Una línea de cotización pide *n* unidades de una medida. El
   sistema mantiene exactamente *n* unidades apartadas para esa línea: al subir la cantidad aparta
   más, al bajarla libera.

2. **Proyección de estado.** El estado de la cotización determina el estado de todas las unidades
   que tiene apartadas. Cambiar la cotización de estado mueve el inventario en bloque.

### Tabla de proyección

| Estado de la cotización | Estado de sus unidades |
|---|---|
| Pre-cotización | En cotización |
| Pendiente | En cotización |
| En progreso | En cotización |
| En renta | Rentada |
| Completada, cuando es de renta | Rentada |
| Completada, cuando es de venta | Vendida |
| Vendida | Vendida |
| Cancelada | Disponible |

El caso que más se presta a error: **una cotización de renta completada deja las unidades rentadas,
no disponibles.** Completar significa que el equipo salió, no que volvió. El retorno es un acto
posterior y explícito.

## Requirements

### Requirement: Una reserva aparta unidades concretas

Reservar SHALL consistir en vincular unidades **identificadas** a una línea de cotización, no en
descontar un contador.

Una unidad SHALL poder estar vinculada como máximo a una línea de cotización vigente.

#### Scenario: La reserva registra qué unidades

- **WHEN** se reservan tres unidades de una medida para una línea
- **THEN** quedan vinculadas tres unidades concretas e identificables
- **AND** se puede saber cuáles son

#### Scenario: Una unidad no se reserva dos veces

- **GIVEN** una unidad ya vinculada a una cotización vigente
- **WHEN** otra cotización intenta reservar unidades de la misma medida
- **THEN** esa unidad no se selecciona

### Requirement: Se reservan las unidades disponibles

Al reservar, el sistema SHALL seleccionar unidades en estado disponible de la medida indicada, de
forma determinista.

Las unidades en estado terminal o ya comprometidas no SHALL seleccionarse.

#### Scenario: Sólo se toman las disponibles

- **GIVEN** una medida con dos unidades disponibles, una vendida y una dañada
- **WHEN** se reservan dos unidades
- **THEN** se seleccionan las dos disponibles

### Requirement: Reconciliación al aumentar la cantidad

Cuando la cantidad de una línea aumente, el sistema SHALL reservar únicamente **la diferencia**,
conservando las unidades ya vinculadas.

#### Scenario: Subir de dos a cinco aparta tres más

- **GIVEN** una línea con dos unidades reservadas
- **WHEN** su cantidad pasa a cinco
- **THEN** se reservan tres unidades adicionales
- **AND** las dos anteriores siguen siendo las mismas

### Requirement: Reconciliación al disminuir la cantidad

Cuando la cantidad de una línea disminuya, el sistema SHALL liberar **la diferencia**, devolviendo
esas unidades a disponible y desvinculándolas de la línea.

#### Scenario: Bajar de cinco a dos libera tres

- **GIVEN** una línea con cinco unidades reservadas
- **WHEN** su cantidad pasa a dos
- **THEN** tres unidades vuelven a estar disponibles
- **AND** dos siguen reservadas para la línea

#### Scenario: Bajar a cero libera todas

- **WHEN** la cantidad de una línea pasa a cero
- **THEN** todas sus unidades vuelven a disponible
- **AND** la línea queda sin unidades vinculadas

### Requirement: Existencia insuficiente detiene la reserva

Cuando no haya unidades disponibles suficientes para satisfacer la cantidad pedida, la reserva SHALL
rechazarse indicando cuántas hay y cuántas se pidieron, y no SHALL reservarse parcialmente.

#### Scenario: No se reserva de forma parcial

- **GIVEN** una medida con dos unidades disponibles
- **WHEN** se intenta reservar cinco
- **THEN** la operación se rechaza
- **AND** ninguna de las dos queda reservada
- **AND** el mensaje indica que hay dos disponibles y se pidieron cinco

### Requirement: Crear inventario exige consentimiento explícito

El sistema SHALL poder crear unidades nuevas para satisfacer una reserva **únicamente** cuando quien
la realiza lo autorice de forma explícita en esa operación.

Sin esa autorización, la falta de existencia SHALL rechazar la reserva.

Cada unidad creada así SHALL quedar registrada como creada por reserva, con su responsable y su
motivo, para que el descuadre entre inventario registrado y físico sea auditable.

La implementación anterior creaba unidades de forma **automática y silenciosa**, de modo que una
cotización podía comprometer equipo que no existía en la nave (ver `DEFECTS.md` M-04).

#### Scenario: Sin autorización no se crea inventario

- **GIVEN** una medida con dos unidades disponibles
- **WHEN** se reservan cinco sin autorizar la creación
- **THEN** la operación se rechaza
- **AND** no se han creado unidades

#### Scenario: Con autorización se crea y se registra

- **GIVEN** la misma medida
- **WHEN** se reservan cinco autorizando explícitamente la creación
- **THEN** se crean tres unidades
- **AND** cada una queda marcada como creada por reserva, con su responsable y la cotización que la motivó

#### Scenario: Las unidades creadas son auditables

- **WHEN** se consulta el inventario de una medida donde se crearon unidades por reserva
- **THEN** puede distinguirse cuáles se dieron de alta por este mecanismo

### Requirement: La reserva es atómica y no admite carreras

Toda operación de reserva SHALL ejecutarse de forma atómica y SHALL impedir que dos operaciones
simultáneas se lleven la misma unidad.

#### Scenario: Dos reservas simultáneas no se solapan

- **GIVEN** una medida con una única unidad disponible
- **WHEN** dos cotizaciones intentan reservarla a la vez
- **THEN** exactamente una lo consigue
- **AND** la otra se rechaza por existencia insuficiente

#### Scenario: Un fallo a mitad no deja unidades a medias

- **GIVEN** una reserva de cinco unidades que falla al vincular la cuarta
- **WHEN** se revierte
- **THEN** ninguna de las cinco queda vinculada
- **AND** todas siguen disponibles

### Requirement: El estado de la cotización proyecta al inventario

Al cambiar el estado de una cotización, el sistema SHALL actualizar el estado de **todas** sus
unidades reservadas conforme a la tabla de proyección.

La proyección SHALL ser atómica: todas las unidades cambian o ninguna lo hace.

#### Scenario: Cancelar libera todo el inventario

- **GIVEN** una cotización en progreso con doce unidades reservadas
- **WHEN** se cancela
- **THEN** las doce vuelven a estar disponibles

#### Scenario: Pasar a renta saca el equipo

- **GIVEN** una cotización de renta en progreso con cuatro unidades
- **WHEN** pasa a estado de renta
- **THEN** las cuatro quedan rentadas

#### Scenario: Una venta completada marca las unidades vendidas

- **GIVEN** una cotización de venta en progreso con dos unidades
- **WHEN** se completa
- **THEN** las dos quedan vendidas

### Requirement: Una renta completada mantiene el equipo fuera

Cuando una cotización **de renta** se complete, sus unidades SHALL quedar rentadas, no disponibles.

Completar una cotización de renta significa que el equipo salió del almacén. Devolverlo es una
acción posterior y explícita.

#### Scenario: Completar una renta no devuelve el equipo

- **GIVEN** una cotización de renta con seis unidades reservadas
- **WHEN** se completa
- **THEN** las seis quedan rentadas
- **AND** ninguna vuelve a disponible
- **AND** no cuentan como disponibles para otra cotización

### Requirement: Retorno explícito del equipo rentado

El sistema SHALL permitir registrar el retorno de las unidades de una cotización de renta,
indicando por cada una si vuelve en condiciones o con incidencia.

Las unidades que vuelvan en condiciones SHALL pasar a disponible; las que vuelvan con incidencia
SHALL pasar al estado de incidencia que se indique.

#### Scenario: El retorno devuelve el equipo al inventario

- **GIVEN** una cotización de renta completada con seis unidades rentadas
- **WHEN** se registra el retorno de las seis en condiciones
- **THEN** las seis quedan disponibles

#### Scenario: Una unidad dañada no vuelve al inventario útil

- **GIVEN** el mismo retorno
- **WHEN** una de las unidades se registra como dañada
- **THEN** cinco quedan disponibles y una queda dañada
- **AND** la dañada no cuenta como disponible

### Requirement: Eliminar una línea libera sus unidades

Eliminar una línea de cotización SHALL liberar todas sus unidades vinculadas, devolviéndolas a
disponible.

#### Scenario: Quitar una línea devuelve su inventario

- **GIVEN** una cotización con dos líneas, una de ellas con tres unidades
- **WHEN** se elimina esa línea
- **THEN** las tres unidades vuelven a estar disponibles
- **AND** las de la otra línea siguen reservadas

### Requirement: Eliminar una cotización libera todo

Eliminar una cotización SHALL liberar todas las unidades que tuviera reservadas, salvo aquellas cuyo
estado ya sea terminal por haberse vendido o rentado.

#### Scenario: Se libera lo reservado y se respeta lo vendido

- **GIVEN** una cotización con tres unidades en cotización y dos ya vendidas
- **WHEN** se elimina la cotización
- **THEN** las tres vuelven a disponible
- **AND** las dos vendidas siguen vendidas

### Requirement: Los importes cerrados no se recalculan

Cuando una cotización alcance un estado cerrado —completada, vendida o cancelada—, sus importes
SHALL quedar congelados y no SHALL recalcularse aunque cambien después los precios del catálogo.

#### Scenario: Un cambio de tarifa no altera lo cerrado

- **GIVEN** una cotización completada
- **WHEN** se modifica la tarifa de uno de sus productos
- **THEN** los importes de la cotización no cambian

### Requirement: Coherencia entre reservas e inventario

En todo momento, el número de unidades en estado de cotización de una medida SHALL ser igual al
número de vínculos vigentes entre esa medida y líneas de cotización.

El sistema SHALL poder verificar esta coherencia y comunicar cualquier discrepancia.

#### Scenario: La verificación detecta una discrepancia

- **GIVEN** un inventario donde una unidad figura en cotización sin vínculo vigente
- **WHEN** se ejecuta la verificación de coherencia
- **THEN** se comunica la discrepancia identificando la unidad
