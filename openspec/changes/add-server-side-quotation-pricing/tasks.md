# 14 · Cálculo de cotizaciones en el servidor — trabajo

## Decisión previa

- [ ] Resolver `DEFECTS.md` M-05: convención de signo del ISR directo
- [ ] Decidir si el bloque fiscal aspira a cumplimiento formal

> El motor implementa el criterio adoptado en la spec —una sola tabla, el ISR directo aumenta la
> base— y lo deja señalado en el código. Confirmarlo es una fila de la tabla; cambiarlo también.

## Motor

- [x] Función pura en el paquete de contratos, sin acceso a datos
- [x] Conversión de días por frecuencia, con dos decimales
- [x] Redondeo opcional, conservando el valor real si redondea a cero
- [x] Precio de renta: fijo, por frecuencia, o precio base
- [x] Precio de penalización: fijo, por frecuencia, o cero
- [x] Descuento por producto sobre el costo unitario
- [x] Total de línea de renta y de venta
- [x] Redondeo por línea antes de sumar
- [x] Conceptos adicionales en el subtotal
- [x] Descuento global, por porcentaje o por importe
- [x] Precio fijo que sustituye a la base, con su descuento
- [x] Tabla de tratamiento fiscal, en un solo lugar
- [x] Comisiones sobre el neto, después de impuestos
- [x] Reparto exacto, con residuo a la última línea
- [x] Anticipo descontado del bruto
- [x] Penalización calculada aparte, fuera del total
- [x] Agrupación por producto, respetando el orden de la cotización
- [x] Desglose con todos los importes intermedios

## Servidor como autoridad

- [x] Recalcular al guardar; descartar los importes recibidos
- [ ] La interfaz consume la misma función, no una reimplementación
- [ ] Retirar el motor del código del navegador

> Las dos esperan a que la interfaz tenga pantallas de cotización (29b). La función ya es la misma
> y está publicada en `@tfv/contracts`; falta que alguien la llame desde el navegador.

## Congelación

- [x] Persistir el desglose al alcanzar estado cerrado
- [x] Las lecturas de una cotización cerrada usan el desglose persistido
- [x] Las abiertas se recalculan

## Documento

- [ ] Documento comercial con líneas que cuadran con el total
- [ ] Ventana de fechas y frecuencia en las cotizaciones de renta
- [ ] Espacio de firma, vacío si no está firmada
- [ ] Enlace público de sólo lectura

## Verificación

- [x] Un caso de prueba por cada escenario de la spec
- [x] Prueba: la suma de líneas es exactamente el subtotal
- [x] Prueba: activar el reparto no altera los impuestos
- [x] Prueba: el reparto suma exactamente la comisión
- [x] Prueba: cotización cerrada no cambia al duplicar tarifas
- [ ] Medición: cuántas cotizaciones abiertas cambian de importe y en cuánto
