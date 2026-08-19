-- La llegada de lo que se acuñó.
--
-- Acuñar inventario que no está en la nave es **prestación y no defecto** (`DEFECTS.md` M-04,
-- decidido el 2026-08-19): cuando una cotización pide más de lo que hay, el almacén lo trae de
-- fuera, y eso es negocio normal. Lo que faltaba era el otro extremo.
--
-- La marca de acuñada no se limpia nunca —que la unidad naciera así sigue siendo cierto, y es lo
-- que hace auditable el descuadre entre inventario registrado y físico—, de modo que sin esta
-- columna la bandeja de pendientes acumulaba para siempre unidades cuyo equipo ya estaba en el
-- estante. Una bandeja que nunca se vacía deja de mirarse.
--
-- Por eso una fecha y no un booleano: lo que interesa no es sólo que dejó de estar pendiente, sino
-- **cuándo**, que es lo que permite medir cuánto tarda en llegar lo que se compromete sin tener.

ALTER TABLE "warehouse_stock_units" ADD COLUMN "arrived_at" timestamp with time zone;