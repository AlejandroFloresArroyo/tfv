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
      (`apps/e2e/tests/suscripcion.spec.ts:175`). Las otras tres de este bloque —planes, cobros y
      bitácora— ya no se distinguen de ésta: desde el 2026-08-22 también se recorren
- [x] Planes: selección, cambio, cancelación, reactivación — **recorrida entera**. Un solo
      recorrido conduce los cinco estados sucesivos de la misma suscripción en
      `apps/e2e/tests/suscripcion.spec.ts:59`: el catálogo con sus tres botones, abandonar el pago
      sin dejar suscripción, contratar y pagar en la página del suplente, cambiar de plan
      conservando los asientos, cancelar al vencimiento sin que el estado deje de operar, y
      reactivar. Sobre una empresa que la propia prueba crea y borra
- [x] Historial de cobros — **lista el cobro que la contratación produjo**: el paso 5 de
      `apps/e2e/tests/suscripcion.spec.ts` va a `settings/payments` y encuentra allí el importe
      —1745,00 MXN— y los asientos del periodo que se acaba de pagar, que es el cobro que emitió el
      segundo evento del suplente
- [x] Bitácora personal y de empresa. La personal se construyó: `account/activity/page.tsx`
      sobre `GET /me/activity`, con el retrato de la empresa —el eje que ahí varía— y la empresa
      nombrada en cada asiento. Se llega desde la ficha de la cuenta y desde el menú del retrato.
      Su prueba (`apps/e2e/tests/bitacora-personal.spec.ts`) afirma lo único que la distingue de la
      de empresa: que enseña lo mío y **no lo del vecino**, con dos personas dejando asiento en la
      misma empresa. No se ofrece filtrar por empresa porque el recurso no lo acepta
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
- [ ] Personajes, sets y videos
- [ ] Jornadas con asignación de reparto y continuidad
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

- [x] Sitios por empresa — **recorrida**: `apps/e2e/tests/sitios.spec.ts:47` da de alta un sitio
      desde el diálogo de la pantalla eligiendo su almacén de origen, comprueba que aparece con su
      dirección pública y sin publicar, lo publica con el interruptor —y la insignia lo dice, que
      antes no (H-302)—, recarga para ver que no era optimismo del navegador, y entra al
      constructor por el nombre
- [~] **Constructor con reordenación y vista previa** — recorrido en
      `apps/e2e/tests/sitios.spec.ts:117`: se crea el tema, se escribe en un editor y la vista
      previa lo enseña, se mueve una sección por su asa y la vista previa cambia de orden, se
      guarda a mano y lo guardado sobrevive a la recarga. **Falta el gesto de arrastre con
      puntero**: se mueve con las flechas del asa —el otro disparador de la misma máquina— porque
      el arrastre nativo de HTML5 no se dispara bajo Playwright en este Chromium, ni con `dragTo`
      ni con `mouse.down` por pasos. La aritmética de las cuatro operaciones sigue probada sin
      navegador en `packages/ui/src/lib/reorder.test.ts`
- [x] Editores de campo por tipo de sección — conducidos en `apps/e2e/tests/sitios.spec.ts:117`,
      y por las tres formas que el catálogo declara: la portada ofrece título, descripción y
      botones y **no** elementos; las preguntas frecuentes, elementos y **no** botones; y una
      sección de catálogo —categorías— no ofrece ninguno de los dos, que es lo que impide enseñar
      ahí un producto que el almacén tiene despublicado
- [~] Tienda pública de almacén — **recorrida hasta el cobro**. `apps/e2e/tests/tienda.spec.ts:95`
      conduce el camino entero de un visitante: se contrata el plan por la pantalla, la tienda pasa
      a servirse, el catálogo se busca y filtra, la ficha ofrece añadir al carrito sin cuenta, el
      carrito se valora contra el catálogo publicado y la compra aparta el equipo con su desglose.
      **Falta el último paso, y no es de la pantalla**: el suplente del procesador no tiene página
      de cobro para una compra de tienda —devuelve la dirección de vuelta— así que nadie emite el
      evento que la confirmaría y «Compra confirmada» no se puede alcanzar desde un navegador
      (H-304). Dos cosas más salieron de aquí: la siembra no deja la categoría que declara la
      vertical, sin la cual ningún sitio es tienda de almacén (H-301), y `STOREFRONT_ORIGIN` no
      estaba puesta en el arnés (H-303)
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
