# 19 · Sitios, constructor y tiendas públicas — trabajo

## Sitio

- [x] Registro con nombre, logotipo, icono, categoría y fuente de catálogo
- [x] Rechazo de fuentes de otra empresa
- [x] Identificador legible único, con consulta de disponibilidad
- [x] Subdominio y dirección derivados
- [x] Publicación y despublicación
- [x] Eliminación que conserva la fuente y libera el identificador

## Resolución

- [x] Extracción del subdominio antes de servir contenido
- [x] El dominio principal no se ve afectado
- [x] Compuerta uno: sitio existente y publicado
- [x] Compuerta dos: suscripción vigente
- [x] Compuerta tres: servicio habilitado
- [x] Una página propia por cada fallo
- [x] Derivación por vertical, con página en construcción por defecto
- [x] Metadatos por página

## Constructor

- [x] Personalización con nombre, color y banner
- [x] Una sola primaria; marcar desmarca
- [x] La primera es primaria
- [x] Programación por ventana de fechas
- [x] Resolución de la vigente: programada antes que primaria
- [x] Desempate determinista ante solapamiento
- [x] Eliminar la primaria promueve otra
- [x] **Corregir la eliminación que borra de la tabla de sitios**
- [x] Catálogo cerrado de tipos de sección
- [x] Tipo desconocido se omite sin romper la página
- [x] Contenido de sección: propiedades, estilos, elementos y botones
- [x] Ocultar sin eliminar
- [x] Orden explícito y reordenación
- [x] Tipos de acción de botón, con validación del destino de desplazamiento
- [x] Vista previa con el renderizado del sitio público
- [x] Contenido inicial por vertical

## Tiendas

- [x] Navegación, pie y secciones de la personalización vigente
- [ ] Registro y acceso desde la propia tienda
- [ ] Cuenta del comprador: direcciones y pedidos de todas las tiendas
- [x] Catálogo paginado, con búsqueda y filtro por categoría con descendientes
- [x] Ficha por identificador o por identificador legible
- [ ] Carrito persistente, con subtotal y estimación de envío — **dos tercios**: persiste por
      tienda en el navegador (`apps/web/src/lib/cart.ts:93-115`) y el servidor lo valora en cada
      cambio, con su subtotal. **No hay estimación de envío en el carrito**: la pantalla dice «el
      envío se calcula en el siguiente paso, con tu dirección»
- [ ] Revalidación de precios y existencias antes de pagar — **la mitad**: el servidor revalida de
      verdad —vuelve a valorar contra el catálogo publicado y aparta unidades concretas—, pero la
      spec pide dos cosas y la segunda no está: «SHALL revalidar precios y existencias … **y SHALL
      avisar** al visitante de cualquier cambio en lugar de cobrarle en silencio»
      (`public-storefronts/spec.md:127-141`). Nadie avisa. Va con la prueba de más abajo
- [ ] Modalidad venta o renta en la vertical de almacén
- [ ] Configurador de mosaicos en su vertical
- [ ] Páginas de confirmación y cancelación
- [ ] Idioma seleccionable y persistente
- [ ] El carrito sobrevive al inicio de sesión
- [x] Las lecturas públicas no exponen costos, ubicaciones ni datos fiscales

> El **formulario público de contacto** que alimenta la bandeja de prospectos —rebanada 10,
> `user-accounts`, «Captura pública de prospectos»— entró con esta rebanada: el servidor ya
> estaba y sólo faltaba la pantalla. Vive en `apps/web/src/app/contacto/`.

## Limpieza

- [~] **Retirar los enlaces a la ruta de presupuesto compartido inexistente** — **no aplicable**:
      los dos archivos con el enlace roto son `[web]`, es decir `tfv-frontend/`, que no está en
      este árbol y que la regla 1 prohíbe tocar (`DEFECTS.md` F-11). En la pila nueva la ruta que
      allí faltaba **existe**: el documento de cotización y su enlace público, rebanada 14

## Verificación

- [x] Prueba por cada una de las tres compuertas
- [x] Prueba: sitio despublicado no revela su existencia
- [x] Prueba: la campaña programada sustituye y se retira sola
- [ ] Prueba: cambio de precio antes de pagar se avisa
- [x] Prueba: el costo interno no sale en la ficha pública
