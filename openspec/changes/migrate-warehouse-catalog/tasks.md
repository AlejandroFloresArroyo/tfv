# 12 · Catálogo de almacén — trabajo

## Almacén

- [ ] Creación con comprobación de habilitación del servicio
- [ ] Identificador legible único y publicación
- [ ] Orden por prioridad, fecha y nombre
- [ ] Baja con borrado lógico, previa enumeración
- [ ] Impedir la baja con trabajo en curso
- [ ] **Corregir la cascada que borra de la tabla de empresas**

## Ubicaciones

- [ ] Árbol con los diez tipos
- [ ] Código autogenerado por tipo y por almacén
- [ ] Regeneración sólo al cambiar de tipo
- [ ] Rechazo de ciclos
- [ ] Eliminación recursiva que deja los productos sin ubicación
- [ ] Recuento de productos de primer nivel
- [ ] Presentación como jerarquía navegable, con selección en la dirección

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
