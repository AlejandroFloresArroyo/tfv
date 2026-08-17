# 12 · Catálogo de almacén — trabajo

Leyenda: `[x]` hecho y comprobado · `[~]` hecho en parte, con la parte que falta anotada.

Hechos **el almacén y su árbol de ubicaciones**. El catálogo, las medidas, los precios y las
unidades siguen sin empezar.

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

- [ ] Producto con su código identificativo único e inmutable
- [ ] Variantes y accesorios como hijos, con herencia
- [ ] Creación con estructura completa **en una transacción**
- [ ] Propagación de la reclasificación a los hijos
- [ ] Listados que muestran sólo los productos raíz
- [ ] Eliminación que arrastra la estructura, con comprobación de compromisos
- [ ] Clasificación doble: categoría de almacén y global
- [ ] Publicación e identificador legible
- [ ] Disponibilidad independiente para venta y para renta
- [ ] Búsqueda y filtrado

## Medidas

- [ ] Dimensiones, peso y unidades de longitud y masa
- [ ] Ficha de sastrería, con todos los campos opcionales
- [ ] Cantidad inicial que materializa unidades
- [ ] Eliminación con comprobación de compromisos

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
