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

- [ ] Personalización con nombre, color y banner
- [ ] Una sola primaria; marcar desmarca
- [ ] La primera es primaria
- [ ] Programación por ventana de fechas
- [ ] Resolución de la vigente: programada antes que primaria
- [ ] Desempate determinista ante solapamiento
- [ ] Eliminar la primaria promueve otra
- [ ] **Corregir la eliminación que borra de la tabla de sitios**
- [ ] Catálogo cerrado de tipos de sección
- [ ] Tipo desconocido se omite sin romper la página
- [ ] Contenido de sección: propiedades, estilos, elementos y botones
- [ ] Ocultar sin eliminar
- [ ] Orden explícito y reordenación
- [ ] Tipos de acción de botón, con validación del destino de desplazamiento
- [ ] Vista previa con el renderizado del sitio público
- [ ] Contenido inicial por vertical

## Tiendas

- [ ] Navegación, pie y secciones de la personalización vigente — navegación y pie hechos; las secciones esperan al constructor
- [ ] Registro y acceso desde la propia tienda
- [ ] Cuenta del comprador: direcciones y pedidos de todas las tiendas
- [x] Catálogo paginado, con búsqueda y filtro por categoría con descendientes
- [x] Ficha por identificador o por identificador legible
- [ ] Carrito persistente, con subtotal y estimación de envío
- [ ] Revalidación de precios y existencias antes de pagar
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

- [ ] **Retirar los enlaces a la ruta de presupuesto compartido inexistente**

## Verificación

- [x] Prueba por cada una de las tres compuertas
- [x] Prueba: sitio despublicado no revela su existencia
- [ ] Prueba: la campaña programada sustituye y se retira sola
- [ ] Prueba: cambio de precio antes de pagar se avisa
- [x] Prueba: el costo interno no sale en la ficha pública
