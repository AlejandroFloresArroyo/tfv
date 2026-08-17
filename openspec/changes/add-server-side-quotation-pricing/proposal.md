# 14 · Cálculo de cotizaciones en el servidor

## Por qué

El motor de cálculo de cotizaciones son trescientas ochenta y cinco líneas de aritmética fiscal
—conversión de días por frecuencia, redondeos, descuentos, precio fijo, IVA, ISR, retenciones,
prorrateo de comisiones, anticipos, penalizaciones— y **vive entero en el navegador**.

Nada valida en el servidor lo que se cobra. El importe de una cotización es el que el navegador
diga.

Además arrastra una incoherencia interna: las dos pasadas del cálculo —con y sin reparto de
comisiones— **usan convenciones de signo distintas para las retenciones** (`DEFECTS.md` M-05). Una
de las dos está mal, y activar el reparto cambia el total por un motivo que no es el reparto.

## Qué entra

- El motor pasa a ser una función pura en el paquete de contratos compartido, ejecutable en ambos
  lados y con el servidor como autoridad.
- Una sola convención de signo, aplicada con independencia del reparto.
- Redondeo por línea antes de sumar, de modo que un documento impreso siempre cuadre.
- Reparto exacto de comisiones, con el residuo a la última línea.
- Congelación de los importes al cerrar la cotización.
- Trazabilidad: cada importe intermedio consultable.
- El documento comercial y el enlace público, con las líneas cuadrando con el total.

## Decisión pendiente

**`DEFECTS.md` M-05 está marcado como `DECIDIR`.** La spec fija la tabla de tratamiento fiscal y
exige una sola convención, pero el tratamiento del **ISR directo** necesita confirmación de
administración.

Hay una segunda pregunta detrás: si el bloque de impuestos aspira a cumplimiento fiscal formal o es
una calculadora de presentación. La respuesta cambia el alcance —cumplir formalmente exigiría un
catálogo de claves fiscales y validaciones que hoy no existen— aunque no la estructura.

## Criterios de aceptación

- Un importe enviado por el cliente que no corresponda se descarta y se almacena el correcto.
- La previsualización del navegador coincide exactamente con lo que el servidor calcula.
- La suma de las líneas mostradas es exactamente el subtotal mostrado.
- Activar el reparto de comisiones no altera el importe total de impuestos.
- El reparto suma exactamente la comisión, con el residuo en la última línea.
- Una cotización cerrada no cambia aunque se dupliquen las tarifas de sus productos.
- Cada importe intermedio es consultable por separado.

## Riesgos

**Los totales de las cotizaciones existentes pueden no reproducirse.** Si la convención que se
adopta difiere de la que produjo un documento ya firmado, recalcularlo daría otra cifra. Por eso los
importes se congelan: las cerradas conservan lo suyo y sólo las abiertas se recalculan. Conviene
medir cuántas abiertas cambiarían y de cuánto, antes del corte.

## Specs

`quotation-pricing` (con su `design.md`) · `quotations`
