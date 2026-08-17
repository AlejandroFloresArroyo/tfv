# 26 · Generador de mosaicos

## Por qué

El generador convierte la foto de un cliente en el mosaico que compra: la imagen previa, la lista de
materiales con la que se cobra y el instructivo con el que lo arma.

Se conserva en el navegador —es la decisión correcta y está razonada en el `design.md` de la
spec—, pero pasa a ser una pieza compartida, sin dependencia de la interfaz, para que sea
literalmente la misma en el mostrador y en la tienda pública.

Dos defectos que corregir:

| Ref | Problema |
|---|---|
| F-09 | Dos de sus etapas **transponen filas y columnas** entre sí, con lo que la lista de materiales y el instructivo no corresponden a la imagen que se muestra |
| F-08 | En la tienda pública, la subida de la imagen generada está comentada, así que **el diseño se pierde** entre el carrito y el pedido |

El primero pasa desapercibido con rejillas cuadradas y se manifiesta con rectangulares.

## Qué entra

- Generador como pieza compartida, sin dependencia de interfaz.
- Una sola correspondencia entre índice y posición, en una sola función que todas las etapas usan.
- Las cuatro etapas: teselado, pixelado, cuantización y recuento.
- Paleta limitada a los colores que la tienda tiene dados de alta.
- Vista de conjunto y previsualización en sala.
- Lista de materiales por lámina y agregada.
- Conservación del diseño al comprar, en ambos caminos.
- Reparto del trabajo por lámina, fuera del hilo de interfaz, con tope de rejilla.

## Decisión pendiente

**`DEFECTS.md` F-09 está marcado como `DECIDIR`.** El diseño fija orden por filas, pero hay que
confirmar contra un mosaico ya fabricado cuál de las dos convenciones corresponde al producto real.
Es una comprobación física, no de código.

## Criterios de aceptación

- Los recortes cubren la imagen sin solaparse ni dejar hueco.
- La rejilla del pixelado coincide con los ladrillos de la lámina.
- Todas las celdas usan colores de la paleta de la tienda.
- Sin paleta configurada, la generación se rechaza indicando qué falta.
- La suma del recuento de una lámina es su número de celdas.
- **Con una rejilla no cuadrada, la imagen y el recuento coinciden en su orientación.**
- Dos generaciones idénticas producen el mismo resultado.
- Un mosaico no se puede vender sin su diseño conservado.
- El resultado es idéntico generado desde el mostrador y desde la tienda pública.

## Riesgos

**Cambiar el espacio de color alteraría el aspecto de un producto que los clientes ya conocen.** Se
conserva deliberadamente el actual, aunque no sea el más fiel a la percepción humana. Si alguna vez
se cambia, hay que regenerar los instructivos de los pedidos pendientes de armar.

## Specs

`mosaic-generation` (con su `design.md`) · `public-storefronts`
