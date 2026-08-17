# 12 · Catálogo de almacén — trabajo

Leyenda: `[x]` hecho y comprobado · `[~]` hecho en parte, con la parte que falta anotada.

Hechos **el almacén, su árbol de ubicaciones, su taxonomía y el catálogo con medidas**. Faltan las
listas de precios y la gestión de unidades de existencia.

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
      cotizaciones (14) y los pedidos (15), que son quienes reservarían
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

- [ ] Listas de precios por almacén
- [ ] Tarifas de venta, renta y penalización, fijas o por periodicidad
- [ ] Precedencia de precio, en un solo lugar del código
- [ ] **Corregir la asignación masiva para que ejecute las bajas**
- [ ] Eliminar una lista no borra los productos

## Unidades

- [ ] Una fila por objeto físico, con código único e inmutable
- [ ] Once estados
- [ ] Alta individual y masiva
- [ ] Modificación individual y masiva, atómica
- [ ] Rechazo del cambio manual sobre unidad comprometida
- [ ] Estados terminales no vuelven a comprometerse
- [ ] Recuperación explícita de las unidades de incidencia
- [ ] Etiquetas individuales y en lote, en ambos formatos
- [ ] Localización por código
- [ ] Historial de cambio de estado con motivo y responsable
- [ ] Decidir si el historial se reconstruye en el corte
