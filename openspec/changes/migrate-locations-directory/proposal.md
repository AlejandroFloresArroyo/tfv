# 27 · Directorio de locaciones

## Por qué

El servicio más pequeño de la plataforma: un catálogo de espacios donde rodar, agrupados en redes y
publicables en el directorio público.

Reimplementación sencilla, con una retirada de alcance.

## Qué entra

- Redes por empresa, con comprobación de habilitación del servicio.
- Locaciones con su ficha completa: dirección, coordenadas, capacidad, superficie, instrucciones de
  acceso, estacionamiento y conexión.
- Actividades permitidas y denegadas, interiores y exteriores, con anotaciones libres.
- Disponibilidad semanal por día y franja.
- Tarifas por hora, día, semana y mes, con tiempo mínimo.
- Clasificación por categoría y tipo.
- Publicación en el directorio público, con las dos compuertas.
- Consulta paginada con búsqueda y filtros.

## Delta de requisitos

`REMOVED` — **Se retiran las reservas de locaciones** (`project.md`, D-09).

Existían a medias: el modelo y los esquemas estaban, pero el manejador de actualización nunca llegó
a exportarse, así que esa ruta **jamás se registró** (`DEFECTS.md` L-12). Ninguna pantalla del
frontend las consumía. La contratación se gestiona hoy por contacto directo.

Si en el futuro se quisiera un sistema de reservas real, sería una capability nueva con
disponibilidad, solapamientos, confirmación y cobro — no la reimplementación de esto.

## Correcciones incluidas

| Ref | Corrección |
|---|---|
| C-08 | La baja de red deja de borrar de la tabla de empresas |
| L-09 | Se retiran las dos rutas que filtran por un campo inexistente y devuelven siempre vacío |
| R-04 | Se resuelve la referencia colgante de las reservas, al retirarlas |

## Criterios de aceptación

- La clave de la conexión no aparece en las lecturas públicas.
- Una locación despublicada deja de aparecer y devuelve `404` al solicitarla.
- Una locación de una empresa sin el servicio de sitios no aparece en el directorio público.
- Filtrar por una categoría incluye sus descendientes.
- Un día marcado como no disponible no muestra franja horaria.
- Una tarifa no disponible no se ofrece.
- Eliminar una red deja sus locaciones inaccesibles.
- No queda ninguna ruta de reservas.

## Specs

`locations-directory`
