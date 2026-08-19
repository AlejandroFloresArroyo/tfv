# 13 · Reserva de existencias transaccional — trabajo

## Decisión previa

- [x] Resolver `DEFECTS.md` M-04: **prestación**. El almacén trae de fuera lo que no tiene; se
      autoriza en el mostrador, la unidad queda marcada, y la llegada se confirma sin borrar la marca

> Implementado el criterio adoptado en la spec —autorización explícita en la operación, con la
> unidad marcada— y señalado en el código. Si negocio confirma que la creación automática es
> deliberada, el cambio es el valor por defecto del parámetro, no el modelo.

## Modelo

- [x] Tabla de vínculo entre unidad y línea de cotización
- [x] Índice único parcial: una unidad, una reserva viva
- [x] Marca de trazabilidad en las unidades creadas por reserva
- [x] Tabla de eventos de cambio de estado por unidad
- [x] Campos de caducidad para las reservas de compra pública

## Reserva

- [x] Selección de candidatas con bloqueo que no serialice las operaciones concurrentes
- [x] Reconciliación por diferencia al aumentar
- [x] Liberación por diferencia al disminuir, empezando por las más recientes
- [x] Rechazo por existencia insuficiente, sin reserva parcial
- [x] Creación de inventario sólo con autorización explícita
- [x] Registro del responsable y la cotización en cada unidad creada
- [x] Toda la operación en una transacción

## Proyección

- [x] Tabla de proyección estado de cotización → estado de unidad, en un solo lugar
- [x] Aplicación atómica sobre todas las unidades de la cotización
- [x] Registro de evento por cada cambio, con la cotización que lo causó

## Retorno

- [x] Registro de retorno por unidad, con o sin incidencia
- [x] Las que vuelven en condiciones pasan a disponible
- [x] Las que vuelven con incidencia pasan al estado indicado

## Liberación

- [x] Eliminar una línea libera sus unidades
- [x] Eliminar una cotización libera lo reservado y respeta lo vendido o rentado
- [x] Congelar los importes al alcanzar estado cerrado

## Coherencia

- [x] Consulta de verificación entre unidades en cotización y vínculos vivos
- [x] Comunicación de discrepancias
- [ ] Ejecución programada de la verificación

## Verificación

- [x] Prueba de concurrencia: dos reservas, una unidad
- [x] Prueba: fallo a mitad no deja unidades vinculadas
- [x] Prueba: sin autorización no se crea inventario
- [x] Prueba: con autorización, la unidad queda marcada
- [x] **Prueba: renta completada deja las unidades rentadas**
- [x] Prueba: retorno con incidencia no devuelve la unidad al inventario útil

> **Lo único que queda de esta rebanada es la ejecución programada de la verificación de
> coherencia**, que necesita el despachador de trabajos en segundo plano de la rebanada 09. La
> consulta y la comunicación de discrepancias ya están, expuestas en su endpoint.
