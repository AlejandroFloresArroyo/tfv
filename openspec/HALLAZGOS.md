# Hallazgos de implementación

Lo que aparece **al construir** y no estaba en ninguna spec: contratos que no se sostenían al
escribirlos, huecos que sólo se ven con el código delante, y claves del catálogo que nadie ejercía.

Es el complemento de [`DEFECTS.md`](./DEFECTS.md), que registra defectos de la **implementación
anterior**. Aquí no hay nada del sistema viejo: son cosas de las specs nuevas y de la construcción
en curso.

Existe porque la regla 4 del plan dice que cuando una spec resulte estar equivocada se corrige y se
anota, y una corrección anotada sólo en el diff no la encuentra nadie. Cada fila dice qué se
encontró, qué se hizo y dónde mirar.

**Estado**
`CORREGIDO` — la spec o el modelo se cambiaron, y el cambio está en el repositorio.
`ABIERTO` — identificado, sin resolver, con su motivo.

---

## Correcciones a las specs

| # | Dónde | Qué no se sostenía | Qué se hizo | Estado |
|---|---|---|---|---|
| H-01 | `quotation-pricing/design.md` | El folio de una cotización se declaraba **único a secas**. En un sistema multi-arrendatario eso impide que dos casas de renta numeren sus documentos cada una desde uno, y hace que el folio de una empresa delate cuántas cotizaciones lleva la anterior. | Índice único `(warehouse_id, folio)`, migración 10. El correlativo se asigna con la fila del almacén bloqueada. | CORREGIDO |
| H-02 | `stock-reservation/design.md` | El invariante I-2 decía «unidades en cotización de una medida = reservas vivas de esa medida». No se sostiene: una cotización **en renta** conserva sus vínculos y sus unidades están rentadas, así que la igualdad falla sin que nada esté mal. | Enunciado contra la **proyección**, que subsume el anterior y además detecta el caso contrario —una unidad comprometida que ya nadie reclama—. | CORREGIDO |
| H-03 | `stock-reservation/design.md` | Dos nombres de columna que el modelo real tiene de otra forma: la trazabilidad de acuñación son **dos** columnas y no una referencia, y la tarifa de una línea apunta al precio de un producto en una lista, no a la lista entera. | Corregidos en el diseño, con la razón de que la cotización no lleve clave foránea: cerraría un ciclo entre módulos y es metainformación de auditoría, no una relación estructural. | CORREGIDO |
| H-04 | `quotation-pricing/spec.md` · modelo | La spec exige que un impuesto **se pueda desactivar sin perder su porcentaje**, y el bloque fiscal del esquema no tenía dónde guardar esa diferencia: un impuesto era su porcentaje, y quitarlo era olvidarlo. Lo mismo con el signo de una contribución adicional. | El bloque fiscal pasó a los contratos con `enabled` por concepto y `effect` por contribución. Sin migración: el tipo de una columna `jsonb` sólo existe en TypeScript. | CORREGIDO |

## Huecos que sólo se ven con el código delante

| # | Dónde | Qué faltaba | Qué se hizo | Estado |
|---|---|---|---|---|
| H-05 | Reserva de existencias | **Cambiar la medida de una línea** no reconciliaba nada: la reconciliación mira la cantidad, y con la misma cantidad la línea acababa diciendo una medida y sujetando unidades de otra. Ni la spec ni el diseño lo contemplan. | Se suelta lo ajeno antes de apartar lo nuevo, con su prueba. Es el descuadre que sólo se descubre el día que alguien va a la nave a buscar el equipo. | CORREGIDO |
| H-06 | Motor de cálculo | El encadenamiento de la spec dice «tarifa fija → su importe fijo; si no → la de la frecuencia, **o el precio base**». Sólo la segunda rama recae en el precio base, y eso no se ve leyendo: una tarifa marcada fija y vacía cobra **cero**, no el catálogo. Apareció al comparar con el ayudante de precios de la 12. | Implementado así, con prueba y comentario. | CORREGIDO |
| H-07 | Rutas de cotización | `warehouses.quotes.rented` era una clave del catálogo que **ninguna ruta exigía**, y el cambio de estado colapsaba en `edit_status` tres claves que la matriz anterior separa. Colapsarlas amplía en silencio la autoridad de quien sólo tenía la general. | La ruta declara la general y el manejador exige además la del destino. Tres pruebas: mover por la bandeja no autoriza a sacar el equipo. | CORREGIDO |
| H-08b | Líneas de cotización | El listado devolvía el **identificador** de la medida y nada más. Dibujar una cotización de doce líneas habría costado trece peticiones, que es el mismo error que la rejilla del catálogo evitó no incluyendo la disponibilidad. | La línea trae el producto y la medida por su nombre, como la localización por código devuelve el camino entero. | CORREGIDO |
| H-08c | Desglose de importes | El concepto de un impuesto se rellenaba con su **clave interna** cuando nadie había escrito uno, así que la ficha enseñaba «iva». Ninguna prueba lo habría cazado: funcionaba. | El concepto es lo que escribió quien lo registró, o nada; traducir la clave es trabajo de la interfaz. Con prueba. | CORREGIDO |
| H-14 | Constructor · motor de cálculo | La cotización previsualizaba **resolviendo la tarifa por su cuenta**, y contra una lista de precios distinta de la que usa cada línea. En la ficha sembrada enseñaba 700.00 en una línea que el servidor cobraba a 70.00 —el precio de venta en lugar de la tarifa semanal—, con el total de la línea contradiciendo al subtotal que tenía tres centímetros más allá. Es el defecto M-06 un paso antes del motor: no en el cálculo, sino en **qué precio se le entrega**. Ninguna prueba lo habría cazado; sólo se vio mirando la pantalla. | La regla de precedencia se trasladó a `@tfv/contracts` (`resolveRate`) y **la línea viaja con su tarifa ya resuelta**, la misma que aplicó el servidor. La previsualización parte de lo que se guardó, no de una segunda lectura del catálogo. | CORREGIDO |
| H-15 | Buscador del constructor | Cuando la lista de precios no tiene tarifa para la periodicidad elegida, el motor cobra **el precio base** —es la regla declarada—, y el buscador lo enseñaba como «por día» sin decirlo. Con la siembra anterior, que sólo fijaba la semanal, eso significaba ofrecer una cámara a diez veces lo que vale su semana. | El buscador marca en aviso las tarifas que nadie fijó, y la siembra pasa a fijar las tres periodicidades. La cifra sigue siendo la que se cobrará: lo que se añade es que nadie la decidió. | CORREGIDO |
| H-16 | Motor de cálculo · spec | **Una renta sin tarifa cobraba el precio de venta multiplicado por los días.** La spec lo declaraba así —«recurriendo al precio base»— y el precio base de un producto es el de venta: catorce días de renta cobraban el equipo catorce veces. Con las listas por día, semana y mes sin llenar en la mayoría de los almacenes, ése era el camino **normal**, no el extremo. | La línea queda **sin precio** y se señala para que se fije uno. Spec corregida bajo la regla 4, con el escenario invertido. Entra con ella el **precio negociado** de línea, que no estaba en ninguna spec y es como se cotiza en la práctica. | CORREGIDO |
| H-17 | Constructor · importes | El panel de importes enseñaba **lo guardado** mientras las líneas enseñaban **lo que se estaba escribiendo**: dos cifras a un palmo de distancia diciendo cosas distintas en cuanto se tocaba una cantidad. Es el mismo defecto que el motor compartido evita, en la otra dirección — y tampoco lo habría cazado ninguna prueba, porque las dos cifras eran correctas por separado. | El editor publica su previsualización y el panel la consume, avisando de que todavía no se ha guardado. | CORREGIDO |
| H-08 | Modelo · contratos | Las condiciones de pago, el bloque fiscal, la tarifa por periodicidad y el desglose estaban declarados **dos veces**: en el esquema y como entrada del motor. El día que divergieran, el importe guardado dejaría de ser el importe calculado. | Declarados una vez en `@tfv/contracts`; el esquema los importa y los reexporta. | CORREGIDO |

## Abiertos

| # | Dónde | Qué pasa | Por qué sigue abierto |
|---|---|---|---|
| H-09 | Permisos de almacén | **Un permiso de producto no descubre el almacén.** `warehouses.products.view` abre el catálogo cuando ya se conoce el identificador, pero la única ruta para descubrirlo exige `warehouses.warehouses.view`. Un papel con el primero y no el segundo recibe `403` antes de poder elegir almacén. | Hay tres salidas —componer los papeles, definir herencia entre permisos, o exponer una consulta de descubrimiento autorizada por los recursos hijos— y elegir es decisión de producto. No se amplió el papel en silencio. |
| H-10 | Rebanadas 13 y 14 | **M-04 y M-05 implementados con el criterio adoptado en la spec**, señalados en el código: acuñar inventario exige autorización explícita, y el ISR directo aumenta la base. | Falta confirmarlos con quien tiene la autoridad. Ninguno toca el modelo: uno es el valor por defecto de un parámetro y el otro una fila de la tabla de tratamiento. |
| H-11 | Coherencia de reservas | La verificación existe y se puede pedir, pero **nadie la ejecuta sola**. Una discrepancia puede vivir meses sin que nadie mire. | Necesita el despachador de trabajos en segundo plano de la rebanada 09. |
| H-13 | Entorno de desarrollo | El proceso de la API se arranca **sin vigilancia de cambios** (`node src/index.ts`, no `--watch`). Un proceso viejo sirve un registro de rutas anterior y las pruebas de extremo a extremo fallan enteras con un `404` que parece un fallo del código. | No es un defecto del sistema, sino del hábito: `pnpm dev` sí vigila. Queda anotado porque costó una vuelta de diagnóstico y volverá a costarla. |
| H-18 | Pruebas de extremo a extremo | La siembra de la suite **no borra**: respeta lo que ya existe. Una prueba que escribe y luego comprueba un valor fijo pasa la primera vez y falla la segunda. Y el aviso de «Guardado» dice que la API contestó, no que el árbol de servidor haya terminado de rehacerse: recargar encima de esa revalidación sirve el documento anterior. | Las dos cosas quedan anotadas en el propio archivo de pruebas, donde las va a leer quien escriba la siguiente. Costaron tres pasadas de diagnóstico creyendo que el defecto era del producto. | ANOTADO |
| H-12 | Entorno de pruebas | `pnpm test` **vacía la base de desarrollo**: las pruebas de la API truncan sus tablas, y con ellas la siembra de volumen. Hay que volver a sembrar después de cada ejecución. Y **dos ejecuciones no pueden solaparse**: se truncan las tablas la una a la otra y los fallos que salen no son de ningún cambio. | Separar la base de pruebas de la de desarrollo está pendiente; es el punto 4 de «Lo siguiente» en el plan. |
