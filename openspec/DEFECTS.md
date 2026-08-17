# Registro de defectos

Defectos confirmados en la implementación anterior, encontrados durante el levantamiento del
sistema. **Ninguno forma parte de la base de las specs**: las specs describen el comportamiento
que se pretende, y estas filas existen para que nadie reintroduzca un defecto por imitar el código
viejo, ni lo "arregle" en silencio sin que quede constancia.

**Decisión**
`ARREGLAR` — la spec describe el comportamiento correcto; la implementación nueva lo cumple.
`DECIDIR` — hace falta una decisión de negocio antes de poder especificarlo.
`ACEPTAR` — comportamiento observable del que puede depender algo externo; se conserva a propósito.

Las rutas de archivo son de `tfv-backend/` salvo que se indique `[web]` (`tfv-frontend/`).

---

## Seguridad

| # | Ubicación | Defecto | Impacto | Decisión |
|---|---|---|---|---|
| S-01 | `src/services/core/stripe/index.ts` | El manejador del webhook **genera su propia firma** con `generateTestHeaderString` en vez de leer el encabezado `stripe-signature` de la petición. La verificación siempre pasa. | Cualquiera puede publicar un evento falso sin autenticar y provocar altas de suscripción, cambios de plan o materialización de pedidos no pagados. | ARREGLAR |
| S-02 | `src/utils/hooks.ts` | La vía `x-api-key` solo **decodifica** el encabezado como JWT; si decodifica, concede acceso. No hay comprobación de firma ni de existencia de la clave. | Cualquier cadena con forma de JWT abre todas las rutas protegidas. Anula por completo la autenticación. | ARREGLAR |
| S-03 | `src/utils/jwt.ts` | Los tokens se firman sin `expiresIn`, sin emisor y sin audiencia. **No caducan nunca.** | Un token filtrado es válido para siempre. No hay forma de revocar una sesión. | ARREGLAR |
| S-04 | todos los manejadores | Para identificar al solicitante se usa `Utils.JWT.Decode`, que **no verifica la firma**. La verificación real solo ocurre en el gancho de entrada, y solo en 22 de 91 módulos. | En una ruta sin gancho, la identidad del actor es lo que el solicitante diga que es. | ARREGLAR |
| S-05 | 69 de 91 módulos | No llevan gancho de autenticación: todo `productions/*`, `warehouses/*`, `locations/*`, `website/*`, `pixit/*` salvo pedidos, más roles, servicios, planes, categorías, notificaciones, pagos del procesador y la API pública. | Todo el inventario, las cotizaciones y las producciones son legibles y escribibles sin credenciales. `POST /api/core/role` permite crear un rol con permisos arbitrarios en cualquier empresa. | ARREGLAR |
| S-06 | en todo el sistema | El alcance por arrendatario depende **únicamente del parámetro de ruta**. Ningún manejador comprueba que quien pide pertenezca a la empresa que nombra la URL. | Cambiar el identificador en la URL devuelve datos de otra empresa. | ARREGLAR |
| S-07 | `src/services/core/role/*` | Los 255 permisos existen pero **nunca se evalúan como control de acceso**. Su único consumidor decide a quién notificar. | El editor de matriz de permisos de la interfaz no restringe nada. | ARREGLAR |
| S-08 | `src/utils/hash.ts` | Los tokens de recuperación de contraseña y las contraseñas temporales se generan con murmur32, que **no es criptográfico**, y no caducan. | Tokens de recuperación adivinables y de validez indefinida. | ARREGLAR |
| S-09 | `src/services/core/user/hooks.ts`, `core/prospect/hooks.ts` | Las notificaciones `invited` y `temp-password` llevan la **contraseña temporal en texto claro** en su carga útil. | La contraseña queda registrada en el proveedor de notificaciones y en el correo del destinatario. | ARREGLAR |
| S-10 | `src/services/warehouses/ws.ts` | El WebSocket toma el token de la **cadena de consulta** y solo lo decodifica. Además valida en cada mensaje, no al establecer la conexión. | Los tokens quedan en registros de servidor y de proxy. Un token forjado abre el canal. | ARREGLAR |
| S-11 | `[web] packages/api/shared/token.ts` | El token se guarda en una cookie **legible por JavaScript**. | Cualquier script inyectado puede leer la sesión. | ARREGLAR |
| S-12 | `src/config/cors.ts` | `origin: "*"` combinado con `credentials: true`. Es una combinación inválida que los navegadores rechazan, y el encabezado `x-api-key` ni siquiera está en la lista de permitidos. | Configuración incoherente que enmascara qué orígenes se pretenden permitir. | ARREGLAR |
| S-13 | `src/config/index.ts` | El secreto de firma tiene el valor literal `"secret"` por defecto. | Si la variable de entorno falta, el sistema arranca con un secreto público. | ARREGLAR |
| S-14 | `[web]` en 3 archivos | La configuración del proveedor de mensajería y su clave están **incrustadas en el código fuente**, incluido el trabajador de servicio. | Credenciales en el repositorio y en el paquete servido al navegador. | ARREGLAR |
| S-15 | `src/services/core/auth/index.ts` | El registro fuerza `valid: true`, de modo que **la verificación de correo se omite** en la práctica. | Cualquiera se registra con un correo que no controla. | ARREGLAR |
| S-16 | `src/services/core/auth/index.ts` | `recoverPassword` devuelve un token **aunque el usuario no exista**. | Devolver un token inservible confunde al cliente. Resuelto en `user-accounts`: la respuesta es idéntica exista o no la cuenta, y **no contiene token**; el enlace sólo viaja al correo. | ARREGLAR |

## Manejadores que operan sobre la entidad equivocada

Todos son errores de copia y pega. El endpoint anuncia una entidad y consulta otra.

| # | Ubicación | Defecto | Decisión |
|---|---|---|---|
| C-01 | `core/order/index.ts` | Los cuatro manejadores de lectura consultan envíos en lugar de pedidos de comprador. Además, el listado por usuario ignora el parámetro de ruta. | ARREGLAR |
| C-02 | `core/payment/index.ts` | Ambas lecturas consultan envíos en lugar de pagos. | ARREGLAR |
| C-03 | `core/checkout/index.ts` | Ambas lecturas consultan envíos en lugar de checkouts. | ARREGLAR |
| C-04 | `pixit/order/index.ts` | Las tres lecturas consultan envíos en lugar de pedidos web de Pixit. | ARREGLAR |
| C-05 | `warehouses/order_chat/index.ts` | Todos los manejadores REST consultan pedidos en lugar de mensajes. La implementación que funciona es la del WebSocket. | ARREGLAR |
| C-06 | `pixit/inventory_*_stock/index.ts` | Lectura, alta y modificación operan sobre la definición de inventario en vez de sobre el movimiento. | ARREGLAR |
| C-07 | `pixit/board/delete.ts`, `pixit/board_size/delete.ts` | Borran de la colección de colores. | ARREGLAR |
| C-08 | `productions/production/delete.ts`, `warehouses/warehouse/delete.ts`, `locations/network/delete.ts` | Tras ejecutar la cascada, **borran de la colección de empresas** usando el identificador de la entidad. | ARREGLAR |
| C-09 | `website/customize/delete.ts` | Borra de la colección de sitios en vez de la de personalizaciones. | ARREGLAR |

## Lógica incorrecta

| # | Ubicación | Defecto | Impacto | Decisión |
|---|---|---|---|---|
| L-01 | `src/utils/google.ts` | `DeleteFileStorageArray` **intersecta en vez de diferenciar**: `urls.filter(u => newUrls.includes(u))`. | Borra los archivos que se conservaron y deja huérfanos los que se quitaron. Exactamente al revés. | ARREGLAR |
| L-02 | `core/prospect/hooks.ts` | El borrado del prospecto pasa un identificador crudo donde se espera un filtro. | La operación no falla pero tampoco borra: los prospectos aceptados se quedan en la bandeja. | ARREGLAR |
| L-03 | `core/auth/index.ts` | La ruta de token usa una proyección donde pretendía una actualización, así que la marca de última actividad nunca se escribe. | ARREGLAR |
| L-04 | `warehouses/product_price/index.ts` | En la asignación masiva, las listas de altas y de bajas se calculan **con el mismo predicado**. | Las bajas nunca se ejecutan: quitar un producto de una lista de precios no tiene efecto. | ARREGLAR |
| L-05 | `productions/order/index.ts` | El listado **regenera el código QR de cada orden en cada llamada**. | Los códigos impresos dejan de coincidir. Escritura en una operación de lectura. | ARREGLAR |
| L-06 | `core/service/index.ts` | El manejador de borrado no invoca la cascada que sí existe en el módulo. | Quedan habilitaciones huérfanas apuntando a un servicio inexistente. | ARREGLAR |
| L-07 | `pixit/session/delete.ts` | La cascada filtra por un campo que los modelos de movimiento no tienen. | No hace nada. | ARREGLAR |
| L-08 | `warehouses/order_chat/ws.ts` | Al borrar un mensaje, la difusión usa el identificador **del mensaje** como clave de sala. | Nadie recibe el aviso de borrado. | ARREGLAR |
| L-09 | `locations/location/schemas.ts` | Dos rutas filtran por un campo que el modelo no declara. | Devuelven siempre vacío. | ARREGLAR |
| L-10 | `core/company_service/index.ts` | La búsqueda por `keycode` compara contra el identificador del servicio. | Nunca encuentra nada cuando se le pasa un keycode real. | ARREGLAR |
| L-11 | `core/provider/hooks.ts` | Empuja el identificador a un campo no declarado en el esquema de empresa. | El modo estricto lo descarta silenciosamente. | ARREGLAR |
| L-12 | `locations/reservations` | La ruta de actualización está declarada pero su manejador nunca se exporta, así que **jamás llegó a registrarse**. | Ver D-09: fuera de alcance. | ACEPTAR |

## Dinero e integridad transaccional

| # | Ubicación | Defecto | Impacto | Decisión |
|---|---|---|---|---|
| M-01 | `core/stripe/payment.ts` | El total del pedido de comprador se fija igual al subtotal, **ignorando el reparto de comisión**. | El comprobante del comprador no cuadra con lo que se transfiere al comercio. | ARREGLAR |
| M-02 | `core/stripe/payment.ts` | La materialización del pedido crea ocho entidades **sin transacción**, y la rama de Pixit usa `forEach(async …)` sin esperar. | Un fallo a mitad deja el pedido incompleto y sin traza. Los hijos del tablero se crean fuera del ciclo de vida y sus errores se pierden. | ARREGLAR |
| M-03 | `core/stripe/payment.ts` | El pipeline **no es idempotente**: la única guarda es el estado del checkout, y se marca antes de hacer el resto del trabajo. | Un reintento del procesador duplica pedidos, pagos y movimientos de inventario. | ARREGLAR |
| M-04 | `warehouses/quote/hooks.ts` | Al aumentar la cantidad de una línea, si no hay unidades disponibles suficientes **se acuñan unidades nuevas**. | Una cotización puede crear inventario físico que no existe. | DECIDIR (¿prestación intencional?) |
| M-05 | `[web] services/warehouse/quote/hooks/useQuotation.ts` | Los dos pases de cálculo usan **signos distintos** para las retenciones: uno suma `IVA − ISR + retención`, el otro `IVA + ISR − retención`. | Activar la equalización de comisiones cambia el total de forma no intencionada. Una de las dos es incorrecta. | DECIDIR |
| M-06 | `[web]` en su totalidad | El motor de cotización (385 líneas de aritmética fiscal) y **toda la ruta de escritura del punto de venta** viven en el navegador. No hay validación de totales ni de existencias en el servidor. | Los importes cobrados y los movimientos de inventario son los que el navegador diga. | ARREGLAR |
| M-07 | `core/stripe/events.ts` | En cada renovación, la sincronización de asientos actualiza la suscripción con `discounts: []`. | **Borra el código promocional en cada ciclo de facturación.** | ARREGLAR |
| M-08 | `core/stripe/events.ts` | Un pago fallido **elimina la suscripción** de inmediato. No hay periodo de gracia ni reintentos. | Un fallo transitorio de tarjeta desactiva la empresa y tumba sus tiendas públicas. | ARREGLAR |
| M-09 | `core/stripe/events.ts` | No hay manejadores para reembolsos, disputas, expiración de sesión ni fallo de intento de pago, aunque los estados `refunded` existen en el modelo. | Estados inalcanzables; reembolsos invisibles para el sistema. | ARREGLAR |
| M-10 | `core/public/hook.ts` | Los checkouts en estado pendiente **nunca expiran**, aunque la sesión del procesador caduca en una hora. Las unidades se seleccionan pero no se marcan. | Sobreventa: dos compradores pueden llevarse la misma unidad. | ARREGLAR |
| M-11 | `core/public/utils/shipping.ts` | El tipo de cambio está **fijo en el código** y las tarifas son constantes literales. La lógica está además duplicada palabra por palabra en el navegador. | Cambiar una tarifa exige desplegar dos veces. | ARREGLAR |

## Referencias colgantes

Referencias declaradas hacia colecciones que no existen o que se llaman de otra forma. Al pasar a
claves foráneas reales, cada una debe resolverse explícitamente.

| # | Referencia | Apunta a | Debería |
|---|---|---|---|
| R-01 | `core_companies_payment.storeId` | `stores_store` | No existe. Determinar si sobra o si debía ser la tienda de Pixit. |
| R-02 | `pixit_order.userOrderId` | `core_user_order` | No existe. Debía ser el pedido de comprador. |
| R-03 | `pixit_order.companyPaymentId` | `core_company_payment` | Nombre en singular; la colección real es en plural. |
| R-04 | `locations_..._reservations.locationId` | `locations_location` | Nombre incorrecto de la colección de locaciones. |
| R-05 | `warehouses_..._quote_product_stock.quoteId` | `warehouses_warehouse_quote` | Singular; la real es plural. |
| R-06 | `warehouses_warehouse_categories.parentId` | `core_categories` | Declara la taxonomía global, pero los campos derivados resuelven contra la taxonomía del almacén. |
| R-07 | `core_order_warehouse.product` | — | Campo derivado sin la clave foránea que lo sustenta. |
| R-08 | `productions_..._chapter.warehouseOrders` | escenas | Apunta a la colección equivocada. |
| R-09 | `..._recording_notes.notes`, `..._workflow_coments.coments` | — | Campos derivados hacia colecciones inexistentes. |

## Operación y arranque

| # | Ubicación | Defecto | Decisión |
|---|---|---|---|
| O-01 | `src/index.ts` | La conexión a la base **no se espera ni se maneja su fallo**. El servidor arranca aunque la base esté caída. | ARREGLAR |
| O-02 | `src/handler/boom.ts` | Casi todos los errores de dominio son `Error` sin código, así que **salen como HTTP 500**. No hay 400, 403, 404 ni 409 en ninguna parte. | ARREGLAR |
| O-03 | `src/schemas/paginate.ts` | El esquema de la cadena de consulta es `z.any()`: **no hay validación alguna** y se pueden inyectar operadores de base de datos arbitrarios desde la URL. | ARREGLAR |
| O-04 | `src/index.ts` | Límite de cuerpo de petición de ~1 GB. | ARREGLAR |
| O-05 | `core/upload/*` | Los archivos en estado pendiente no tienen recolector. Una subida interrumpida deja la fila para siempre. | ARREGLAR |
| O-06 | `src/utils/upload.ts` | Los marcadores de posición apuntan a **dominios de terceros** (`test-videos.co.uk`, `w3.org`). | ARREGLAR |
| O-07 | `productions/pdf/index.ts` | La sincronización del guion no se espera, no reporta progreso y sus fallos no llegan al usuario. No hay cola. | ARREGLAR |
| O-08 | `warehouses/order_chat/ws.ts` | El registro de salas vive **en memoria de un solo proceso**. | ARREGLAR |
| O-09 | `src/config/index.ts` | Configuración declarada y nunca leída: host de callback, host y puerto de caché, credenciales de un proveedor de IA no utilizado. | ARREGLAR |
| O-10 | ambos repositorios | **Cero pruebas automatizadas.** | ARREGLAR |

## Frontend

| # | Ubicación | Defecto | Impacto | Decisión |
|---|---|---|---|---|
| F-01 | `packages/api/shared/axios.ts` | El encabezado de autorización se fija **una sola vez al cargar el módulo**. | Obliga a recargar la página entera al iniciar sesión, cerrarla o cambiar el correo. No hay renovación ante un 401, pese a que la ruta de refresco existe. | ARREGLAR |
| F-02 | en todo el frontend | **1 287 llamadas manuales de refresco** repartidas en 351 archivos; cero invalidaciones de caché. | Qué se actualiza tras qué mutación es una decisión ad hoc por pantalla. | ARREGLAR |
| F-03 | `packages/api/shared/query.ts` | Cada resultado se refleja en dos átomos globales, con una serialización completa del resultado como dependencia de efecto **en cada render**. | Riesgo de rendimiento sistémico. | ARREGLAR |
| F-04 | `packages/api/shared/fetch.ts` | Cada petición de servidor etiqueta la caché, pero **no existe ninguna revalidación** en todo el repositorio. | Infraestructura muerta que aparenta ser caché incremental. | ARREGLAR |
| F-05 | `next.config.js` | Se suprime el error de compilación por usar parámetros de búsqueda sin frontera de suspensión. | Enmascara un problema real de renderizado. | ARREGLAR |
| F-06 | `next.config.js` | Se sobrescribe el minimizador por defecto —también en desarrollo— y se añade un cargador por hilos **además** del compilador nativo. | Síntoma de compilaciones lentas, no solución. Descarta el troceado que el framework configura. | ARREGLAR |
| F-07 | `src/i18n/index.ts` | Los recursos de traducción se cargan con una API exclusiva de un empaquetador concreto. | Impide cambiar de empaquetador. | ARREGLAR |
| F-08 | `[web] packages/components/Cart/hooks/useCart.ts` | La subida de la imagen generada está comentada, así que la obra **se pierde entre el carrito y el pedido**. | Un pedido web de mosaico llega sin el diseño que compró el cliente. | ARREGLAR |
| F-09 | `[web] services/pixit/point-of-sale/` | Dos funciones del generador **transponen filas y columnas** entre sí. | Afecta la lista de materiales y el instructivo impreso. | DECIDIR |
| F-10 | `pixit/sale/delete.ts` | Anular una venta **borra los movimientos de inventario** en vez de generar asientos compensatorios. | Destruye el libro mayor, que por lo demás es de solo anexado. | DECIDIR |
| F-11 | `[web]` en 2 archivos | Enlaces a una ruta de presupuesto compartido que no existe. | Enlace roto. | ARREGLAR |
| F-12 | `package.json` | Dependencias declaradas con **cero usos**: máquina de estados, biblioteca de gráficas alterna, compresión, utilidades de rutas, fechas, procesado de imagen en servidor, lienzo. En el backend: cliente de un proveedor de IA y cliente de correo. | Superficie de ataque y peso de instalación sin contrapartida. | ARREGLAR |
| F-13 | `packages/components/EditorImage/pintura/` | 43 632 líneas de un editor de imagen **comercial** incrustadas en el repositorio, ~21 % del código por líneas. | Riesgo de licencia. Hay que confirmar si es transferible al frontend nuevo o si hace falta un sustituto. | DECIDIR |
| F-14 | `packages/components/Icon/assets/` | 14 232 líneas de trazados de iconos y 5 976 de banderas **compiladas dentro del paquete servido**. | Peso de descarga innecesario. | ARREGLAR |

---

## Pendientes de decisión

Las specs ya están escritas: cada una adopta el criterio defendible por defecto y lo señala. Lo que
falta es **confirmar ese criterio con quien tiene la autoridad para hacerlo**. Cada fila indica en
qué rebanada bloquea la implementación.

| Ref | Pregunta | Criterio adoptado en la spec | Bloquea |
|---|---|---|---|
| M-04 | ¿Que una cotización pueda crear unidades físicas inexistentes es prestación o defecto? | Exige autorización explícita en la operación, con la unidad marcada y auditable | Rebanada 13 |
| M-05 | ¿Cuál es la convención de signo correcta para el ISR directo? ¿El bloque fiscal aspira a cumplimiento formal o es una calculadora de presentación? | Tabla de tratamiento fiscal con una sola convención; el ISR directo aumenta la base | Rebanada 14 |
| F-09 | ¿Cuál de las dos indexaciones del mosaico corresponde al producto real? | Orden por filas, en una sola función que todas las etapas usan | Rebanada 26 |
| F-10 | ¿Anular una venta genera asientos compensatorios? | Sí; borrar los movimientos es incompatible con un libro mayor | Rebanada 24 |
| F-13 | ¿La licencia del editor de imagen es transferible al frontend nuevo? | Sin criterio: es una comprobación legal, no técnica | Rebanada 28 |
| — | ¿Las 255 claves de permiso pasan a tabla versionada, o siguen como constante compartida? | Dato del servidor, versionado y consultable | Rebanada 05 |
| — | ¿Dónde se generan los documentos, en el navegador o en el servidor? | Sin criterio: los requisitos están escritos para no depender de ello | Rebanada 28 |
| — | ¿El alcance de traducción es sólo español, o español e inglés completos? | Sin criterio: multiplica el trabajo de cada pantalla | Rebanada 29 |
| — | ¿Cómo se propaga la identidad del solicitante al motor de datos? | Sin criterio: determina si el aislamiento en dos capas es real | Rebanada 06 |

Las tres primeras son decisiones de negocio disfrazadas de defectos. Las últimas cuatro son
decisiones de alcance y de arquitectura que nadie ha tomado todavía.
