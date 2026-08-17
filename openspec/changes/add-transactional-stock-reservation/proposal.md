# 13 · Reserva de existencias transaccional

## Por qué

Es el área de mayor riesgo de corrección del servicio de almacenes. Aquí se decide qué unidad
concreta queda apartada para qué cliente, y un error se traduce en equipo prometido dos veces o en
equipo bloqueado que nadie puede rentar.

Dos problemas de fondo en la implementación anterior:

- **La reserva no es atómica ni está protegida frente a la concurrencia.** Dos cotizaciones
  simultáneas pueden llevarse la misma unidad.
- **Cuando no hay existencia suficiente, se crean unidades nuevas de forma automática y
  silenciosa** (`DEFECTS.md` M-04). Una cotización puede comprometer equipo que no existe en la
  nave, sin que nadie se entere.

## Qué entra

- Reserva atómica con bloqueo de fila, tolerante a la concurrencia.
- Reconciliación por diferencia al subir y bajar la cantidad.
- Rechazo por existencia insuficiente, sin reservar parcialmente.
- Creación de inventario **sólo con autorización explícita** en la operación, y marcada como tal
  para que sea auditable.
- Proyección del estado de la cotización sobre sus unidades, atómica.
- Retorno explícito del equipo rentado, con registro de incidencias por unidad.
- Verificación de coherencia entre reservas e inventario.

## Decisión pendiente

**`DEFECTS.md` M-04 está marcado como `DECIDIR`.** La spec exige autorización explícita, que es lo
defendible por defecto. Si negocio confirma que la creación automática es una prestación
deliberada —para no bloquear una venta con el cliente delante— el cambio es el valor por defecto del
parámetro, no el modelo: la marca de trazabilidad se conserva en ambos casos.

Conviene resolverlo **antes** de implementar, porque condiciona la interfaz de la operación.

## Criterios de aceptación

- Dos reservas simultáneas sobre una única unidad disponible: exactamente una la consigue.
- Una reserva que falla a mitad no deja ninguna unidad vinculada.
- Sin autorización, la falta de existencia rechaza la reserva y no crea nada.
- Con autorización, las unidades creadas quedan marcadas con su responsable y su motivo.
- Cancelar una cotización libera todas sus unidades.
- **Completar una cotización de renta deja las unidades rentadas, no disponibles.**
- Registrar el retorno devuelve a disponible las que vuelven en condiciones.
- La verificación de coherencia detecta una unidad en cotización sin vínculo vivo.

## Riesgos

**El caso de la renta completada es contraintuitivo** y es donde más fácil es introducir una
regresión: completar significa que el equipo salió, no que volvió. Merece su propia prueba y un
comentario en el código.

## Specs

`stock-reservation` (con su `design.md`) · `stock-units`
