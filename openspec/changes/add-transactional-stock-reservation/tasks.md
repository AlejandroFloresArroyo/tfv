# 13 · Reserva de existencias transaccional — trabajo

## Decisión previa

- [ ] Resolver `DEFECTS.md` M-04: ¿la creación de inventario es prestación o defecto?

## Modelo

- [ ] Tabla de vínculo entre unidad y línea de cotización
- [ ] Índice único parcial: una unidad, una reserva viva
- [ ] Marca de trazabilidad en las unidades creadas por reserva
- [ ] Tabla de eventos de cambio de estado por unidad
- [ ] Campos de caducidad para las reservas de compra pública

## Reserva

- [ ] Selección de candidatas con bloqueo que no serialice las operaciones concurrentes
- [ ] Reconciliación por diferencia al aumentar
- [ ] Liberación por diferencia al disminuir, empezando por las más recientes
- [ ] Rechazo por existencia insuficiente, sin reserva parcial
- [ ] Creación de inventario sólo con autorización explícita
- [ ] Registro del responsable y la cotización en cada unidad creada
- [ ] Toda la operación en una transacción

## Proyección

- [ ] Tabla de proyección estado de cotización → estado de unidad, en un solo lugar
- [ ] Aplicación atómica sobre todas las unidades de la cotización
- [ ] Registro de evento por cada cambio, con la cotización que lo causó

## Retorno

- [ ] Registro de retorno por unidad, con o sin incidencia
- [ ] Las que vuelven en condiciones pasan a disponible
- [ ] Las que vuelven con incidencia pasan al estado indicado

## Liberación

- [ ] Eliminar una línea libera sus unidades
- [ ] Eliminar una cotización libera lo reservado y respeta lo vendido o rentado
- [ ] Congelar los importes al alcanzar estado cerrado

## Coherencia

- [ ] Consulta de verificación entre unidades en cotización y vínculos vivos
- [ ] Comunicación de discrepancias
- [ ] Ejecución programada de la verificación

## Verificación

- [ ] Prueba de concurrencia: dos reservas, una unidad
- [ ] Prueba: fallo a mitad no deja unidades vinculadas
- [ ] Prueba: sin autorización no se crea inventario
- [ ] Prueba: con autorización, la unidad queda marcada
- [ ] **Prueba: renta completada deja las unidades rentadas**
- [ ] Prueba: retorno con incidencia no devuelve la unidad al inventario útil
