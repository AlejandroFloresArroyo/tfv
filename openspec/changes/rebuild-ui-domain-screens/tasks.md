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
- [x] Perfiles de facturación, con su asistente — la pantalla en `settings/billing/` y el
      asistente de alta en `settings/billing/new/profile-wizard.tsx`. La prueba de extremo a
      extremo lo recorre entero y comprueba que resume lo escrito
      (`apps/e2e/tests/suscripcion.spec.ts:70`), que es lo que la distingue de las otras tres de
      este bloque: en ellas la prueba sólo llega a la pantalla. Ver H-151
- [ ] Planes: selección, cambio, cancelación, reactivación — **escrita entera y sin recorrer**:
      las cuatro acciones están en `settings/plan/plan-actions.tsx`, y la única prueba afirma que
      **sin plan contratado** no hay nada que pulsar (`apps/e2e/tests/suscripcion.spec.ts:47`),
      porque la siembra no deja ningún plan (H-141). Ver H-151
- [ ] Historial de cobros — **escrita y comprobada sólo por su encabezado**:
      `settings/payments/page.tsx` sobre la colección paginada, y de ella
      `apps/e2e/tests/suscripcion.spec.ts:26` afirma que se llega y que el título está. Que liste
      un cobro no lo comprueba nadie, y con H-141 tampoco habría cobro que listar. Ver H-151
- [ ] Bitácora personal y de empresa — **falta la personal**. La de empresa está y bien probada:
      `settings/activity/page.tsx`, con `apps/e2e/tests/avisos.spec.ts:52`, `:143` y `:161`. La
      personal no tiene pantalla: `GET /me/activity` existe en el servicio y no la consume nadie
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
- [ ] **Conversación en tiempo real del pedido** — la pantalla está y está probada de verdad
      (`warehouses/[warehouseId]/orders/[orderId]/conversation.tsx`, con
      `apps/e2e/tests/conversacion.spec.ts:29`, `:63` y `:96`: se escribe, aparece sin recargar,
      sobrevive a la recarga, se corrige y se retira). Lo que falta es el **tiempo real**: detrás
      hay una consulta periódica y no una conexión persistente, que es la 16 y espera
      configuración externa (H-66)

## 29c · Producciones

- [ ] Producción y su panel
- [ ] Guiones con extracción y visor
- [ ] Capítulos y escenas
- [x] Personajes, sets y videos — bajo `rodaje/`, la base exacta que la pestaña del encargo del
      guion apunta (`production-nav.tsx` no se tocó). Personajes con foto de referencia y su
      propio historial —`characters/[characterId]/page.tsx`, el extremo de personaje del
      recorrido «¿qué llevaba puesto?»—; sets con su composición de artículos —un artículo puede
      estar en varios—, con el mismo patrón de selector que `ComposeDelivery`; biblioteca de
      videos con subida directa (hasta 300 MB, `~/components/video-picker.tsx`, nuevo y sin tocar
      `photo-picker.tsx`) y reproducción en diálogo. `productions.videos.select_category` deja de
      estar sin ejercer (H-173): es la primera pantalla que la consume. **Comprobado en el
      navegador**: producción propia sembrada, las siete pantallas recorridas con Playwright en
      tableta, celular y escritorio, oscuro y claro, con clics de verdad —no sólo capturas—, tras
      encontrar y corregir H-260 (los diálogos no abrían: faltaba `DialogTrigger`).
- [x] Jornadas con asignación de reparto y continuidad — `rodaje/page.tsx` (aterrizaje de la
      pestaña) y `rodaje/[recordingId]/page.tsx`. Asignar reparto abre una continuidad por
      personaje y pone la jornada en curso, sin quitar a quien ya está asignado —`assignCharacters`
      es aditiva—; la utilería de cada continuidad son dos selectores, uno por tipo, así que
      «artículo o video, nunca los dos» no es una comprobación de pantalla, es una forma que no se
      puede escribir. Cerrar no exige continuidad completa; asignar reparto sobre una jornada
      cerrada la reabre —lo hace el servidor sin comprobar el estado— y el diálogo lo avisa antes
      en vez de esconder el botón. El cuaderno del script son notas libres con autor y fecha.
      **Comprobado en el navegador** con el mismo recorrido que `rodaje-recorrido.test.ts`, y
      además con una prueba de extremo a extremo propia:
      `apps/e2e/tests/rodaje.spec.ts` recorre del catálogo a la continuidad con clics —crea
      personaje, set y su composición, video, jornada, asigna reparto, cuelga utilería, anota y
      cierra— y cierra comprobando el historial del personaje. Pasa dos veces seguidas contra la
      base y los puertos propios de este encargo.
- [x] Inventario de utilería con estados y etiquetas
- [x] Entregas con verificación pieza por pieza y **firma** — con la hoja del documento y su enlace público, que faltaban: cierra `HALLAZGOS.md` H-201
- [x] **Calendario de planes de trabajo con sus cuatro vistas** — bajo la pestaña de planes que ya existía, sin pestaña nueva. Pinta jornadas, planes y tareas; por debajo de tableta cambia la rejilla por una agenda de los días con algo. **Comprobado con `pnpm check`, `pnpm lint:ci` y la suite, no en un navegador**
- [x] Tareas, actividades, comentarios y adjuntos — con el documento del plan y su enlace público, que faltaba por dibujar. **Igual: sin comprobación en navegador**
- [x] Anclas y compras — bajo el presupuesto, que es una pestaña de la producción y tres pantallas por dentro. Las anclas en tabla porque se comparan importes; las compras en tarjetas porque llevan ocho datos y ocho columnas no caben en una tableta
- [x] Presupuesto con gráficas y documento — barras de SVG en línea, sin librería nueva; una diferencia negativa se señala **con la palabra** y no sólo con el color; la hoja reutiliza `print-rules.tsx`. **Comprobado además en el navegador**: las cinco pantallas y las dos hojas públicas servidas contra una base sembrada
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

- [ ] Sitios por empresa — **escrita y comprobada sólo por su encabezado**:
      `c/[companyId]/websites/page.tsx` con sus acciones, y `apps/e2e/tests/tienda.spec.ts:95`
      afirma a propósito «que se llega, que la pantalla se identifica», no qué hay dentro.
      Ver H-151
- [ ] **Constructor con reordenación por arrastre y vista previa** — **escrito entero y sin
      recorrer**: `c/[companyId]/websites/[websiteId]/builder.tsx`, con `ReorderList` y la vista
      previa que monta el mismo componente que sirve la tienda. Probados por debajo están la
      reordenación (`packages/ui/src/lib/reorder.test.ts`) y la equivalencia de la previsualización
      (`api/websites/customizations.test.ts:531`); la pantalla, no. Ver H-151
- [ ] Editores de campo por tipo de sección — escritos, en el `SectionEditor` del mismo
      constructor (`builder.tsx:383`), y sin prueba que los conduzca. Ver H-151
- [ ] Tienda pública de almacén — **escrita entera y no recorrible**: catálogo, ficha, carrito y
      página de compra están en `apps/web/src/app/s/[slug]/`, y servir una tienda exige
      suscripción vigente, que hoy no se puede contratar porque no hay ningún plan (H-141, H-140).
      Su prueba de extremo a extremo recorre a propósito las dos salidas que sí se alcanzan
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
