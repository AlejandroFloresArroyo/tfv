# 12 · Catálogo de almacén — trabajo

Leyenda: `[x]` hecho y comprobado · `[~]` hecho en parte, con la parte que falta anotada.

**Hecha entera salvo lo que depende de documentos que aún no existen**: las tres comprobaciones de
compromiso necesitan las cotizaciones (14) y los pedidos (15). Las etiquetas imprimibles, que
esperaban a la pantalla, ya están.

## Almacén

- [x] Creación con comprobación de habilitación del servicio. **No es el permiso**: el permiso dice
      qué puede hacer una persona dentro de la empresa, la habilitación dice qué contrató la
      empresa. Sin esta comprobación, quien tiene todos los permisos de una empresa sin almacenes
      podría crear uno
- [x] Identificador legible único y publicación. Al crear se añade sufijo al colisionar —nadie lo
      eligió—; al cambiarlo a mano se **rechaza**, porque alguien escribió uno concreto
- [x] Orden por prioridad, fecha y nombre. Son tres criterios y no uno: la prioridad empata en
      cuanto dos almacenes valen lo mismo, que es lo normal porque casi nadie la toca
- [x] Baja con borrado lógico, previa enumeración
- [ ] Impedir la baja con trabajo en curso — necesita cotizaciones (14) y pedidos (15), que son
      quienes lo tendrían
- [x] **Corregir la cascada que borra de la tabla de empresas**: no hay cascada escrita a mano que
      pueda hacerlo. El contenido deja de ser accesible porque toda lectura parte del almacén

## Ubicaciones

- [x] Árbol con los diez tipos
- [x] Código autogenerado por tipo y por almacén, y **sin cruzarse entre almacenes**
- [x] Regeneración sólo al cambiar de tipo. Nunca al renombrar: el código está impreso en etiquetas
      pegadas a estantes
- [x] Rechazo de ciclos — lo único de este árbol que el motor no puede impedir por sí solo, porque
      la consulta que lo detecta es recursiva
- [x] Eliminación recursiva que deja los productos sin ubicación. Las dos consecuencias las hace el
      motor: la cascada autorreferente y la clave foránea a nulo
- [x] Recuento de productos de primer nivel, sin contar variantes ni accesorios
- [x] Camino de la raíz a una ubicación, para situarla sin recorrer el árbol
- [ ] Presentación como jerarquía navegable, con selección en la dirección — es pantalla (29b)

## Catálogo

- [x] Producto con su código identificativo único e inmutable. Doce caracteres del alfabeto de
      Crockford —sin `I`, `L`, `O` ni `U`, que se confunden en una etiqueta impresa y dictada por
      teléfono—. La garantía de unicidad **es el índice**, no la aleatoriedad
- [x] Variantes y accesorios como hijos, con herencia de almacén, ubicación, clasificación y
      responsable. La herencia es **una copia al crearse**, no una referencia: poder divergir es lo
      que hace que una variante sea una variante y no una vista del padre
- [x] Creación con estructura completa **en una transacción**. Comprobado con un fallo del motor a
      mitad de la segunda variante, cuando ya están escritos el producto, sus tres medidas y la
      primera variante entera
- [x] Propagación de la reclasificación a los hijos, a cualquier profundidad. Sólo los tres campos
      que se heredan; el nombre y el precio de una variante son suyos
- [x] Listados que muestran sólo los productos raíz
- [~] Eliminación que arrastra la estructura. **Falta la comprobación de compromisos**: necesita las
      cotizaciones (14) y los pedidos (15), que son quienes reservarían. Lo que sí está es la
      comprobación sobre las **unidades**, que ya se rechaza si están comprometidas
- [x] Clasificación doble: categoría de almacén y global, independientes
- [x] Publicación e identificador legible
- [x] Disponibilidad independiente para venta y para renta
- [x] Búsqueda y filtrado, **con el filtro de categoría incluyendo las descendientes**. Esa
      expansión no la hace la gramática genérica, que no sabe qué campos son jerárquicos

## Taxonomía del almacén

- [x] Árbol propio por almacén, con identificador legible único **dentro de su almacén** y no del
      mundo: es como cada casa de renta organiza su nave
- [x] Rechazo de ciclos, y eliminación recursiva que deja los productos sin clasificar

## Medidas

- [x] Dimensiones, peso y unidades de longitud y masa
- [x] Ficha de sastrería, con todos los campos opcionales
- [x] Cantidad inicial que **materializa unidades**: no es un número guardado, son filas. Sin fila
      no hay nada que etiquetar, mover ni reservar
- [~] Eliminación que arrastra sus unidades. **Falta la comprobación de compromisos**, por lo mismo

## Precios

- [x] Listas de precios por almacén, con cuántos productos tienen tarifa en cada una
- [x] Tarifas de venta, renta y penalización, fijas o por periodicidad. **Una tarifa fija ignora la
      frecuencia**, y por eso se mira primero: mirarla después haría que una fija con un importe
      diario suelto cobrara el diario
- [x] Precedencia de precio, **en un solo lugar del código**. Repartida por cotizaciones, tienda y
      punto de venta, se convierte en tres reglas que coinciden hasta que alguien toca una
- [x] **Corregir la asignación masiva para que ejecute las bajas** (L-04). Las dos direcciones se
      calculan ahora con criterios opuestos; antes se calculaban con el mismo y la lista de bajas
      salía siempre vacía
- [x] Eliminar una lista no borra los productos. Lo que desaparece es el precio que la lista les
      daba, y quien resuelva después cae al escalar o a cero: es la precedencia funcionando
- [x] El cero se devuelve **marcado como ausencia de precio**, no como precio: un producto a cero en
      una cotización casi siempre es un producto sin tarifa, no un regalo
- [x] El ajuste de la medida se suma **en centavos y con enteros**: `0.1 + 0.2` no es `0.3` en coma
      flotante, y mil productos convierten eso en una factura que no cuadra por unos pesos

## Unidades

- [x] Una fila por objeto físico, con código único e inmutable
- [x] Once estados, en tres grupos: compromiso, salida e incidencia
- [x] Alta individual y masiva — es la misma operación, porque son la misma fila repetida
- [x] Modificación individual y masiva, **atómica**: si una no admite el cambio, no cambia ninguna
- [x] Rechazo del cambio manual sobre unidad comprometida. Liberarla se hace deshaciendo el
      compromiso, o la cotización seguiría diciendo que la tiene
- [x] Estados terminales no vuelven. Una vendida no se recupera con un cambio de estado
- [x] Recuperación explícita de las unidades de incidencia: las dañadas se reparan y vuelven
- [x] Etiquetas individuales y en lote, en ambos formatos. Hoja imprimible en la pantalla de la
      medida, con el código de doce caracteres en grande —se dicta por teléfono— y el mismo código
      bidimensional o de barras, a elegir al imprimir. **Sin la ubicación**: la unidad se mueve y la
      etiqueta va pegada. El código ya usaba el alfabeto de Crockford, que es lo que la etiqueta
      necesita del servidor
- [x] Localización por código, con producto, medida, ubicación y estado. Cuelga del almacén y no de
      la medida: quien lee la etiqueta **no sabe** de qué producto es, para eso la lee
- [x] Historial de cambio de estado con motivo y responsable, **incluida el alta**: sin el momento
      inicial el historial empieza en el segundo estado
- [ ] Decidir si el historial se reconstruye en el corte — no se puede con fidelidad: de la pila
      anterior sólo se conoce el estado final
