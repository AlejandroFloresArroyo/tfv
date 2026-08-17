# 19 · Sitios, constructor y tiendas públicas

## Por qué

La cara pública de la plataforma: cada empresa sirve su tienda en un subdominio propio, con las
secciones que haya compuesto en el constructor.

Es en su mayor parte reimplementación. Lo que merece atención es la **resolución por subdominio**:
ocurre antes que cualquier otra cosa en cada petición entrante, y sus tres compuertas tienen cada
una su propia página porque el motivo del fallo importa —no es lo mismo un sitio que no existe que
uno cuya empresa dejó de pagar—.

Y el detalle con más consecuencias del constructor: la **personalización programada por fechas** que
sustituye al tema primario mientras dura y se retira sola. Es lo que permite montar una campaña de
diciembre sin que nadie tenga que acordarse de desactivarla en enero.

## Qué entra

- Registro de sitio con identificador legible único, vertical y fuente de catálogo.
- Resolución por subdominio con sus tres compuertas y sus tres páginas.
- Derivación del subdominio y la dirección pública.
- Constructor: personalizaciones, secciones, orden, elementos y botones.
- Personalización primaria y programada por fechas, con la vigente resuelta.
- Vista previa con el mismo renderizado que el sitio público.
- Contenido inicial por vertical.
- Tiendas públicas: catálogo, ficha, carrito, cuenta del comprador y páginas de retorno del pago.
- Revalidación del carrito antes de pagar.
- Idioma seleccionable y persistente.

## Correcciones incluidas

| Ref | Corrección |
|---|---|
| C-09 | La eliminación de una personalización deja de borrar de la tabla de sitios |
| F-11 | Se retiran los enlaces a una ruta de presupuesto compartido que no existe |

## Criterios de aceptación

- Un subdominio sin sitio sirve la página de no encontrado.
- Un sitio despublicado se comporta como inexistente y no revela que existe.
- Una empresa sin suscripción vigente sirve la página correspondiente, no el catálogo.
- Una vertical desconocida sirve la página en construcción, sin error.
- Despublicar un producto lo retira de la tienda sin tocar el sitio.
- La personalización programada sustituye a la primaria durante su ventana y se retira sola.
- Eliminar la primaria promueve otra.
- La vista previa no afecta al sitio público.
- Un cambio de precio entre añadir al carrito y pagar se avisa, no se cobra en silencio.
- El carrito sobrevive al inicio de sesión.
- La ficha pública no expone costos ni ubicaciones físicas.

## Specs

`websites` · `site-builder` · `public-storefronts`
