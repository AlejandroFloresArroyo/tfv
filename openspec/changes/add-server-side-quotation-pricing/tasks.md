# 14 · Cálculo de cotizaciones en el servidor — trabajo

## Decisión previa

- [ ] Resolver `DEFECTS.md` M-05: convención de signo del ISR directo
- [ ] Decidir si el bloque fiscal aspira a cumplimiento formal

## Motor

- [ ] Función pura en el paquete de contratos, sin acceso a datos
- [ ] Conversión de días por frecuencia, con dos decimales
- [ ] Redondeo opcional, conservando el valor real si redondea a cero
- [ ] Precio de renta: fijo, por frecuencia, o precio base
- [ ] Precio de penalización: fijo, por frecuencia, o cero
- [ ] Descuento por producto sobre el costo unitario
- [ ] Total de línea de renta y de venta
- [ ] Redondeo por línea antes de sumar
- [ ] Conceptos adicionales en el subtotal
- [ ] Descuento global, por porcentaje o por importe
- [ ] Precio fijo que sustituye a la base, con su descuento
- [ ] Tabla de tratamiento fiscal, en un solo lugar
- [ ] Comisiones sobre el neto, después de impuestos
- [ ] Reparto exacto, con residuo a la última línea
- [ ] Anticipo descontado del bruto
- [ ] Penalización calculada aparte, fuera del total
- [ ] Agrupación por producto, respetando el orden de la cotización
- [ ] Desglose con todos los importes intermedios

## Servidor como autoridad

- [ ] Recalcular al guardar; descartar los importes recibidos
- [ ] La interfaz consume la misma función, no una reimplementación
- [ ] Retirar el motor del código del navegador

## Congelación

- [ ] Persistir el desglose al alcanzar estado cerrado
- [ ] Las lecturas de una cotización cerrada usan el desglose persistido
- [ ] Las abiertas se recalculan

## Documento

- [ ] Documento comercial con líneas que cuadran con el total
- [ ] Ventana de fechas y frecuencia en las cotizaciones de renta
- [ ] Espacio de firma, vacío si no está firmada
- [ ] Enlace público de sólo lectura

## Verificación

- [ ] Un caso de prueba por cada escenario de la spec
- [ ] Prueba: la suma de líneas es exactamente el subtotal
- [ ] Prueba: activar el reparto no altera los impuestos
- [ ] Prueba: el reparto suma exactamente la comisión
- [ ] Prueba: cotización cerrada no cambia al duplicar tarifas
- [ ] Medición: cuántas cotizaciones abiertas cambian de importe y en cuánto
