# 27 · Directorio de locaciones — trabajo

## Redes

- [ ] Red por empresa, con comprobación de habilitación del servicio
- [ ] Eliminación con borrado lógico que arrastra sus locaciones
- [ ] **Corregir la cascada que borra de la tabla de empresas**

## Locaciones

- [ ] Ficha con nombre, descripción, dirección, coordenadas, capacidad y superficie
- [ ] Imágenes y responsable
- [ ] Instrucciones de llegada
- [ ] Estacionamiento: disponibilidad, tipo e instrucciones
- [ ] Conexión: disponibilidad, nombre de red y clave
- [ ] **La clave nunca sale en lecturas públicas**
- [ ] Actividades permitidas y denegadas, con anotaciones libres
- [ ] Interiores y exteriores, con anotaciones libres
- [ ] Disponibilidad por día de la semana con franja horaria
- [ ] Día no disponible sin franja
- [ ] Tarifas por hora, día, semana y mes, con tiempo mínimo
- [ ] Tarifa no disponible no se ofrece
- [ ] Clasificación por categoría y tipo

## Directorio público

- [ ] Publicación e identificador legible
- [ ] Compuerta de publicación
- [ ] Compuerta de habilitación del servicio de sitios
- [ ] Consulta paginada con búsqueda y filtros
- [ ] Filtro por categoría con descendientes

## Retirada de alcance

- [~] **Retirar el modelo, los esquemas y las rutas de reservas** — **no aplicable**: viven en
      `locations/reservations` de `tfv-backend/`, que no está en este árbol y que la regla 1
      prohíbe tocar (`DEFECTS.md` L-12). Aquí la retirada se cumple **no construyéndolas**, y lo
      que lo garantiza es la prueba de más abajo: que no exista ninguna ruta de reservas
- [x] Delta de requisitos `REMOVED` en `locations-directory` — escrito en
      `proposal.md:22-31`, con el motivo y con qué haría falta si algún día se quisieran de
      verdad, y recogido en la propia spec (`openspec/specs/locations-directory/spec.md:14`). Es
      una tarea de contrato: el artefacto **es** la prueba, no hay suite que la ejerza
- [ ] Resolver la referencia colgante asociada
- [~] **Retirar las dos rutas que filtran por un campo inexistente** — **no aplicable**: están en
      `locations/location/schemas.ts` de `tfv-backend/`, fuera de este árbol (`DEFECTS.md` L-09).
      La pila nueva no las reimplementa, que es la forma que aquí tiene de retirarlas
- [~] Verificar que ninguna pantalla del frontend las consumía — **no aplicable**: las pantallas
      son `tfv-frontend/`, que no está en este árbol. La comprobación ya se hizo al levantar el
      sistema y su resultado está escrito en `proposal.md`: ninguna las consumía

## Verificación

- [ ] Prueba: la clave de conexión no sale en público
- [ ] Prueba: locación despublicada devuelve `404`
- [ ] Prueba: sin el servicio de sitios no aparece en el directorio
- [ ] Prueba: filtrar por categoría incluye descendientes
- [ ] Prueba: no existe ninguna ruta de reservas
