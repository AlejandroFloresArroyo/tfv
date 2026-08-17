# Glosario — vocabulario congelado

Este vocabulario es de lectura obligada antes de escribir o revisar una spec. Está **congelado**:
cambiar un término aquí obliga a revisar todas las specs que lo usan.

La columna *Origen* nombra la colección de la implementación anterior, sólo como ayuda de
trazabilidad durante la migración. Las specs **no** deben citar nombres de colección.

---

## La trampa principal: "pedido" son cuatro cosas

Este es el error de lectura más caro del sistema. Las cuatro entidades coexisten y a veces se
apuntan entre sí.

| Término en specs | Origen | Qué es | Quién lo crea |
|---|---|---|---|
| **Pedido de comprador** | `core_order` | Lo que compra una persona en una tienda pública. Agrupa el pago, el envío y las líneas. Es el comprobante del lado del comprador. | El sistema, tras un cobro confirmado |
| **Pedido de almacén** | `warehouses_warehouse_order` | Solicitud de equipo dirigida a un almacén concreto. Es la unidad de trabajo del operador del almacén: se acepta, se cotiza, se entrega, se finaliza. | Un comprador (vía pedido de comprador), o una producción (vía orden de compra) |
| **Orden de compra de producción** | `productions_production_order` | Intención de una producción de conseguir equipo. **No es ejecutable por sí sola**: se abre en N pedidos de almacén, uno por cada almacén implicado. | El responsable de una producción |
| **Pedido web de Pixit** | `pixit_order` | Equivalente al pedido de almacén, pero para una tienda de Pixit. | El sistema, tras un cobro confirmado |

Regla de redacción: **nunca escribir "pedido" a secas**. Siempre "pedido de almacén",
"pedido de comprador", "orden de compra de producción" o "pedido web de Pixit".

Un segundo par ambiguo, menos grave:

| Término | Origen | Distinción |
|---|---|---|
| **Venta de mostrador** | `pixit_sale` | Ticket presencial cobrado en el punto de venta de una tienda física |
| **Pedido web de Pixit** | `pixit_order` | Compra en línea a través de la tienda pública |

---

## Núcleo: identidad y arrendatarios

| Término | Origen | Definición |
|---|---|---|
| **Principal** | — | Quien realiza una acción. Puede ser un miembro, un comprador o un administrador de plataforma. Un mismo usuario puede actuar con varios roles (ver D-01). |
| **Usuario** | `core_user` | Una persona con credenciales. Padrón único: el correo es único a nivel global. |
| **Empresa** | `core_companies` | El arrendatario. Todo dato de negocio pertenece a exactamente una empresa. |
| **Propietario** | `company.ownerId` + `isOwner` | Quien controla una empresa. **Los propietarios eluden toda comprobación de permisos.** Puede haber más de uno. |
| **Membresía** | `core_companies_user` | La pertenencia de un usuario a una empresa, con su rol y si está activa. Es la fila que concede acceso al panel. |
| **Rol** | `core_role` | Conjunto de permisos con nombre, **propio de una empresa**. No hay roles globales. |
| **Permiso** | clave en `role.permissions` | Cadena con puntos de tres niveles, `<servicio>.<recurso>.<acción>`, p. ej. `warehouses.quotes.edit_products`. Hay 255. |
| **Administrador de plataforma** | `user.admin` | Opera por encima de los arrendatarios. Recibe una membresía sintética de propietario en cualquier empresa. |
| **Prospecto** | `core_prospect` | Interesado que aún no tiene cuenta. Al aceptarlo se materializa como usuario. |
| **Contraparte** | `core_client` / `core_provider` | Con quién comercia una empresa. **Espejadas**: cuando A le compra a B, se crea un cliente en B y un proveedor en A. |

## Suscripción y habilitación

| Término | Origen | Definición |
|---|---|---|
| **Plan** | `core_subscription` | Oferta comercial. `tier 0` es el plan gratuito. Los precios viven en el procesador de pagos, no aquí. |
| **Suscripción** | `core_companies_subscription` | El vínculo vigente entre una empresa y un plan, con su estado y periodo. |
| **Asiento** | `quantity` | Unidad de licencia. Se factura por usuario activo; añadir un miembro consume uno. |
| **Servicio** | `core_service` | Uno de los cinco dominios, identificado por su `keycode`. |
| **Habilitación** | `core_companies_service` | Que una empresa tenga activado un servicio. |
| **Compuerta** | — | Una de las tres comprobaciones independientes de acceso a funcionalidad: suscripción vigente, servicio habilitado y permiso de rol. **Las tres son independientes**; ninguna implica a las otras. |
| **Perfil de facturación** | `core_companies_billing` | Los datos con los que una empresa recibe cobros de sus propios clientes. Uno es el primario. |

## Almacenes

| Término | Origen | Definición |
|---|---|---|
| **Almacén** | `warehouses_warehouse` | Establecimiento que renta y vende equipo. Pertenece a una empresa. |
| **Ubicación** | `warehouses_warehouse_storage` | Nodo del árbol físico: piso, área, pasillo, sección, bahía, rack, estante, tarima, caja, contenedor. Diez niveles con código autogenerado. |
| **Producto** | `warehouses_warehouse_product` | Artículo del catálogo. Puede tener **variantes** y **accesorios**, ambos productos hijos. |
| **Medida** | `warehouses_warehouse_product_measurement` | El nivel al que se lleva existencia. Un producto tiene varias. Lleva dimensiones, peso y —para vestuario— una ficha de sastrería de 45 campos. |
| **Unidad** | `warehouses_warehouse_product_stock` | **Una fila = un objeto físico**, con su propio código. Once estados posibles. Es la pieza que se reserva, se renta y se vende. |
| **Disponibilidad** | `stocksByStatus` | Recuento de unidades por estado en una medida. Es la primitiva de disponibilidad de toda la plataforma. |
| **Lista de precios** | `warehouses_warehouse_price` | Tarifario con nombre. Un producto puede aparecer en varias. |
| **Tarifa** | `warehouses_warehouse_product_price` | El precio de un producto dentro de una lista: venta, renta (fija o por día/semana/mes) y penalización. |
| **Cotización** | `warehouses_warehouse_quotes` | Documento comercial: qué, cuándo, a qué precio, con qué impuestos y bajo qué condiciones de pago. |
| **Línea de cotización** | `warehouses_warehouse_quote_product` | Una medida cotizada, con su tarifa y frecuencia. |
| **Reserva** | `warehouses_warehouse_quote_product_stock` | El vínculo que aparta una unidad concreta para una cotización. |
| **Frecuencia** | `daily \| weekly \| monthly` | Unidad de cobro de la renta. Determina qué tarifa aplica y cómo se convierten los días. |

## Producciones

| Término | Origen | Definición |
|---|---|---|
| **Producción** | `productions_production` | Un proyecto audiovisual. Pertenece a una empresa. |
| **Capítulo** | `..._chapter` | División mayor del guion. |
| **Escena** | `..._scene` | Unidad narrativa dentro de un capítulo, numerada. |
| **Guion** | `..._pdf` | El documento del que se extraen capítulos y escenas. |
| **Sincronización** | `pdf.sync` | La extracción asistida de capítulos y escenas a partir del guion. |
| **Jornada de rodaje** | `..._recording` | Sesión de grabación de una escena. |
| **Continuidad** | `..._continuity` | Registro de cómo aparece un personaje en una jornada: qué utilería y qué videos. |
| **Utilería** | `..._prop` | Un elemento dentro de una continuidad. Es **o** un artículo de inventario **o** un video de referencia, nunca ambos. |
| **Artículo de producción** | `..._product` | Objeto físico del inventario de la producción, con su código y su estado. |
| **Set** | `..._set` | Agrupación de artículos que conforman un decorado. |
| **Nota de entrega** | `..._deliveries` | Documento de traspaso de artículos, con verificación pieza por pieza y firma. |
| **Plan de trabajo** | `..._workflow` | Programación de una jornada: tareas, actividades y comentarios. |
| **Ancla** | `..._anchor` | Partida **presupuestada** (lo que se esperaba gastar o ingresar). |
| **Compra** | `..._shopping` | Gasto **realizado**. El presupuesto es la diferencia entre anclas y compras. |

## Pixit

| Término | Origen | Definición |
|---|---|---|
| **Mosaico** | — | Una foto convertida en arte de ladrillos. El producto que se vende. |
| **Tablero** | `pixit_board` | Línea de producto. Define el diseño, no el tamaño. |
| **Tamaño de tablero** | `pixit_board_size` | Cuántas **láminas** de ancho por alto tiene un tablero. Aquí vive el precio. |
| **Lámina** | `pixit_sheet` | Placa base. Su `x`/`y` son cuántos **ladrillos** caben en cada eje. |
| **Ladrillo** | `pixit_color` | Un color de la paleta. Cada celda del mosaico se cuantiza al ladrillo más cercano. |
| **Sala** | `pixit_room` | Fondo de ambientación para previsualizar el mosaico colgado. |
| **Tienda** | `pixit_store` | Establecimiento físico. El inventario es por tienda. |
| **Definición de inventario** | `pixit_inventory_*` | Que una tienda maneja cierto tablero, lámina o color, y a qué precio. |
| **Movimiento** | `pixit_inventory_*_stock` | Asiento de inventario. **Las entradas son positivas y las salidas negativas; nada se modifica ni se borra.** La existencia es la suma. |
| **Bolsa** | `bags` | Unidad de empaque de ladrillos. Los movimientos de ladrillo llevan doble unidad: bolsas y piezas. |
| **Sesión de caja** | `pixit_session` | Turno de un cajero, con fondo inicial y conteo final. |
| **Venta de mostrador** | `pixit_sale` | Ticket presencial. Sus movimientos de inventario la referencian. |

## Sitios web

| Término | Origen | Definición |
|---|---|---|
| **Sitio** | `websites_website` | Una tienda pública. Se sirve en un subdominio derivado de su slug. |
| **Vertical** | `category.keyname` | Qué tipo de tienda es: de almacén, de Pixit, o ninguna conocida (página en construcción). |
| **Personalización** | `websites_customize` | Un tema con su lista de secciones. Uno es el primario; otros pueden estar programados por fechas y lo sustituyen mientras estén vigentes. |
| **Sección** | `components[]` | Bloque de la página: portada, categorías, productos, acerca de, características, testimonios, preguntas frecuentes, pie. |
| **Slug** | `slug` | Identificador legible y único. Toda lectura pública acepta slug o identificador indistintamente. |

## Plataforma

| Término | Origen | Definición |
|---|---|---|
| **Archivo** | `core_upload` | Referencia a un objeto almacenado, con sus derivados. Referenciado por ~40 entidades. |
| **Derivado** | `quality.*` | Versión redimensionada de una imagen o fotograma de un video: miniatura, pequeño, mediano, grande. |
| **Marcador de posición** | `default: true` | Archivo compartido que se usa cuando no se subió nada. **Nunca se borra.** |
| **Actividad** | `core_companies_activity` | Asiento de bitácora de una acción sobre una empresa. Es además la carga útil de la notificación. |
| **Audiencia** | — | Los miembros que reciben la notificación de una actividad. Se determina por permiso; los propietarios siempre están incluidos. |
| **Envolvente de paginación** | — | La forma de toda respuesta paginada: documentos más metadatos de página. |

---

## Términos que evitamos

| No usar | Usar | Por qué |
|---|---|---|
| "pedido" a secas | el nombre completo de las cuatro | Ambigüedad crítica |
| "stock" | **unidad** (la fila) o **existencia** (el recuento) | En el original designa ambas cosas |
| "orden" | "orden de compra de producción", o "pedido" para el resto | Anglicismo que agrava la ambigüedad |
| "tenant" | **empresa** o **arrendatario** | |
| "board" / "sheet" / "brick" | tablero / lámina / ladrillo | |
| "cliente" para el navegador | **navegador** o **aplicación web** | "Cliente" está tomado por la contraparte comercial |
