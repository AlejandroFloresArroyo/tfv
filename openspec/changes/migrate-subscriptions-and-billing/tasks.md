# 11 · Suscripciones y alta de comercio — trabajo

## Catálogo

- [ ] Planes con nivel, título, descripción y prestaciones
- [ ] Precios y periodicidades desde el procesador, sin duplicar
- [ ] Declarar las prestaciones como descriptivas, sin efecto operativo

## Suscripción

- [ ] Contratación con periodicidad y asientos
- [ ] Restricciones del plan gratuito: un asiento, una empresa por usuario
- [ ] Consulta de disponibilidad del plan gratuito
- [ ] Rechazo de contratación con suscripción vigente
- [ ] Descuento por volumen y admisión de código promocional
- [ ] Cambio de plan conservando asientos, con prorrateo
- [ ] Cancelación al vencimiento
- [ ] Reactivación antes del vencimiento
- [ ] Registro de cobros consultable

## Asientos

- [ ] Ampliación al incorporar sin asientos libres, con prorrateo
- [ ] Sin ampliar si hay asientos libres
- [ ] Liberación al retirar
- [ ] **La sincronización conserva los descuentos**

## Gracia

- [ ] Fallo de cobro pasa a pago pendiente, sin eliminar
- [ ] Periodo de gracia configurable
- [ ] Transición a impagada al agotarse
- [ ] Restablecimiento tras cobro correcto

## Compuertas

- [ ] Comprobación de suscripción vigente en el servidor
- [ ] Comprobación de habilitación por clave de servicio, en cada operación
- [ ] Independencia de las tres compuertas
- [ ] Tienda pública deja de servirse sin suscripción vigente

## Alta de comercio

- [ ] Perfil con datos fiscales, bancarios y de representante
- [ ] Validación de la cuenta bancaria
- [ ] Validación de mayoría de edad del representante
- [ ] Alta de la cuenta de comercio, con su cuenta bancaria y su representante
- [ ] Registro del instante y origen de la aceptación de términos
- [ ] Un solo perfil primario; marcar desmarca
- [ ] Enlace de verificación con el procesador
- [ ] Sincronización de capacidades y estado
- [ ] Consulta del perfil operativo, sin exponer datos fiscales ni bancarios
- [ ] Impedir eliminar un perfil con transferencias pendientes
- [ ] Libro de ingresos de la empresa

## Verificación

- [ ] Prueba por cada combinación de las tres compuertas
- [ ] Prueba: renovación conserva el descuento
- [ ] Prueba: fallo de cobro no elimina la suscripción
- [ ] Prueba: sin perfil operativo la tienda no cobra
- [ ] Prueba: perfil activo no primario no habilita
