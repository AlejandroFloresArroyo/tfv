# 29 · Pantallas de dominio — trabajo

Leyenda: `[x]` hecho y comprobado · `[~]` hecho en parte, con la parte que falta anotada.

## Decisión previa

- [x] Decidir el alcance de traducción — **español e inglés desde el primer componente**, con
      los dos idiomas alineados clave a clave y comprobado que no se desalinean

## 29a · Núcleo y administración

- [x] Acceso, registro, recuperación y verificación — llegaron con la 28
- [~] Perfil y sesiones abiertas. **Faltan** el cambio de contraseña y el de correo, que necesita
      verificar la dirección nueva (rebanada 10)
- [~] Selector de empresa y alta. **Falta la gestión**: editar y dar de baja desde la pantalla
- [x] Miembros: incorporación, retirada, activación, rol y propiedad
- [x] Roles con su matriz de permisos, construida desde el catálogo del servidor
- [~] Direcciones **de empresa**, con su libreta explorable y la regla de la primaria en la
      pantalla. Faltan las **de usuario** —misma libreta, otro dueño— y el selector en mapa (28e)
- [x] Clientes y proveedores, **con permisos separados**: son dos colecciones distintas y no la
      misma con un parámetro, porque un parámetro no se puede autorizar por separado
- [ ] Perfiles de facturación, con su asistente
- [ ] Planes: selección, cambio, cancelación, reactivación
- [ ] Historial de cobros
- [ ] Bitácora personal y de empresa
- [ ] Consola de administración de plataforma

## 29b · Almacenes

- [ ] Almacenes y su panel
- [x] Catálogo con rejilla, filtros y paginación
- [ ] **Asistente de producto de cinco pasos**
- [ ] **Asistente de variante de cuatro pasos**
- [ ] Detalle de producto: información, medidas, precios, unidades
- [ ] Unidades con etiquetas individuales y en lote
- [~] **Listas de precios**: listado con cuántos productos tienen tarifa en cada una, alta, edición
      y baja con la cascada contada por el servidor, ficha con las tarifas —venta, renta y
      penalización, fija o por periodicidad— y **asignación masiva** en las dos direcciones. Falta
      la advertencia que la spec pide cuando la lista está **referenciada por cotizaciones en
      curso**: no hay dato en la API con el que darla (H-34)
- [ ] Categorías anidadas
- [x] **Ubicaciones como organigrama navegable**
- [x] Bandeja de cotizaciones y ficha, con su equipo apartado y sus importes
- [~] **Constructor de cotizaciones**: el editor de líneas con la disponibilidad delante, el cambio
      de estado, el registro del retorno, y los bloques de condiciones de pago e impuestos, que se
      guardan solos. Faltan los de identidad y contactos, que tienen su ruta y su permiso pero
      todavía no su formulario
- [ ] Documento de cotización y su enlace público
- [x] Pedidos con aceptación y rechazo
- [ ] **Conversación en tiempo real del pedido**

## 29c · Producciones

- [ ] Producción y su panel
- [ ] Guiones con extracción y visor
- [ ] Capítulos y escenas
- [ ] Personajes, sets y videos
- [ ] Jornadas con asignación de reparto y continuidad
- [ ] Inventario de utilería con estados y etiquetas
- [ ] Entregas con verificación pieza por pieza y **firma**
- [ ] **Calendario de planes de trabajo con sus cuatro vistas**
- [ ] Tareas, actividades, comentarios y adjuntos
- [ ] Anclas y compras
- [ ] Presupuesto con gráficas y documento
- [ ] Tienda interna y órdenes de compra

## 29d · Pixit

- [ ] Catálogo de datos maestros
- [ ] Tiendas y su configuración inicial
- [ ] Inventario por tipo, con avisos de existencia baja
- [ ] Sesiones de caja: apertura, cierre y cuadre
- [ ] **Punto de venta con el generador de mosaicos**
- [ ] Ventas, recibo e instructivo de armado
- [ ] Pedidos web

## 29e · Sitios y portada

- [ ] Sitios por empresa
- [ ] **Constructor con reordenación por arrastre y vista previa**
- [ ] Editores de campo por tipo de sección
- [ ] Tienda pública de almacén
- [ ] Tienda pública de mosaicos
- [ ] **Configurador público de mosaicos**
- [ ] Cuenta del comprador y carrito
- [ ] Portada de marketing y documentos legales

## Transversal

- [ ] Toda pantalla consume el cliente tipado generado
- [ ] Ninguna reimplementa los primitivos
- [ ] Invalidación declarada por recurso
- [ ] Acciones no permitidas omitidas
- [ ] Textos a través de la capa de traducción
- [ ] Verificación en ancho de teléfono
- [ ] Recorrido de extremo a extremo por cada dominio
