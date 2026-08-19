# 29 · Pantallas de dominio — trabajo

Leyenda: `[x]` hecho y comprobado · `[~]` hecho en parte, con la parte que falta anotada.

## Decisión previa

- [x] Decidir el alcance de traducción — **español e inglés desde el primer componente**, con
      los dos idiomas alineados clave a clave y comprobado que no se desalinean

## 29a · Núcleo y administración

- [x] Acceso, registro, recuperación y verificación — llegaron con la 28
- [~] Perfil, sesiones abiertas, **cambio de contraseña** y cambio de correo. La contraseña
      advierte antes de confirmar que el cambio cierra **todas** las sesiones, incluida aquella
      desde la que se cambia — que es lo que hace el servicio, y no lo que decía la spec (H-45).
      **Falta** canjear el enlace del correo nuevo de extremo a extremo: se emite y nadie lo
      entrega todavía (rebanada 09)
- [~] Selector de empresa, alta, y **gestión** —editar y dar de baja— en configuración, al lado
      de miembros, roles y direcciones: quien tiene una sola empresa se salta el selector y ahí no
      habría encontrado nunca dónde editarla. La comisión sólo se ofrece a la administración de
      plataforma. La baja enumera los **servicios** que dejan de estar accesibles, y no cuántos
      almacenes o cotizaciones se lleva: la empresa no tiene alcance que preguntar como sí lo tiene
      un almacén, ni el servicio comprueba la suscripción activa que la spec exige (H-47). **Falta**
      además editar la imagen y los sectores: no hay ruta para una ni modelo para los otros (H-48)
- [x] Miembros: incorporación, retirada, activación, rol y propiedad
- [x] Roles con su matriz de permisos, construida desde el catálogo del servidor
- [~] Direcciones **de empresa y de usuario**, con su libreta explorable y la regla de la primaria
      en la pantalla. Son la misma pantalla con otro dueño, de verdad: el camino de la API y quién
      puede qué viajan como dato, y la de la persona no consulta permisos porque su libreta cuelga
      de ella. **Falta** el selector en mapa y las sugerencias al escribir (28e)
- [x] Clientes y proveedores, **con permisos separados**: son dos colecciones distintas y no la
      misma con un parámetro, porque un parámetro no se puede autorizar por separado
- [ ] Perfiles de facturación, con su asistente
- [ ] Planes: selección, cambio, cancelación, reactivación
- [ ] Historial de cobros
- [ ] Bitácora personal y de empresa
- [~] Consola de administración de plataforma. **Existe desde el 2026-08-19** bajo `/platform`, con
      su propia navegación, la guarda de `app-shell` en el armazón —sin la marca se va al panel— y
      cuatro pantallas: la bandeja de prospectos con su flujo de aprobación, el padrón de empresas,
      el de cuentas y la bitácora de plataforma. **Faltan** las dos superficies cuyas rebanadas de
      servidor todavía no existen: reprocesar un evento de cobro (`payment-webhooks`) y habilitar
      servicios de una empresa (`companies`). Escribir datos de una empresa desde aquí queda fuera a
      propósito: es otra decisión y no tiene clave de permiso que la respalde (H-121)

## 29b · Almacenes

- [~] Almacenes: listado, alta, edición y baja desde la pantalla, con el identificador legible
      editable sólo donde el servicio respeta lo escrito y la baja enumerando su alcance. **El
      panel ya existe**, como primera pestaña y no como portada —el porqué, en su commit—: cuenta
      productos y altas por completar, las cotizaciones por estado y los pedidos por decidir, y
      lista lo que pide atención. Le falta **el recuento de unidades por estado**, que la API de
      hoy no permite componer sin una petición por medida (H-58)
- [x] Catálogo con rejilla, filtros y paginación
- [x] **Asistente de producto de cinco pasos**, con validación por paso contra el esquema del
      servidor y el paso en la dirección
- [x] **Asistente de variante de cuatro pasos**. Son cuatro y no cinco por el modelo: un hijo
      hereda la clasificación del padre, así que ese paso no existe
- [x] Detalle de producto: información, medidas, precios, unidades. Un diálogo por bloque, porque
      cada bloque tiene su clave y un panel que se guarda solo mandaría peticiones que el
      servidor rechaza a medias
- [x] Unidades con etiquetas individuales y en lote. Pantalla de la medida con la tabla, el alta
      masiva, el cambio de estado en lote con motivo y la baja, el historial por unidad, y la hoja
      imprimible en los dos formatos de máquina
- [~] **Listas de precios**: listado con cuántos productos tienen tarifa en cada una, alta, edición
      y baja con la cascada contada por el servidor, ficha con las tarifas —venta, renta y
      penalización, fija o por periodicidad— y **asignación masiva** en las dos direcciones. Falta
      la advertencia que la spec pide cuando la lista está **referenciada por cotizaciones en
      curso**: no hay dato en la API con el que darla (H-37)
- [x] Categorías anidadas
- [x] **Ubicaciones como organigrama navegable**, y editable sobre él: crear dentro, renombrar,
      cambiar de padre y eliminar
- [x] Bandeja de cotizaciones y ficha, con su equipo apartado y sus importes
- [x] Alta de cotización desde la bandeja: tipo, cliente y ventana, y de ahí al constructor
- [x] **Constructor de cotizaciones**: el editor de líneas con la disponibilidad delante, el cambio
      de estado, el registro del retorno, y **los cuatro bloques que se guardan solos** —identidad,
      contactos, condiciones de pago e impuestos—. La ventana de fechas entra en el punto de
      composición, así que mover el fin rehace los días que cobra cada línea antes de guardar
- [x] **Documento de cotización y su enlace público**
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
