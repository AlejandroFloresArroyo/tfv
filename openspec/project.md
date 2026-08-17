# TFV — Contexto del proyecto

## Qué es TFV

TFV ("The Film Vault") es una plataforma SaaS multi-arrendatario para la industria audiovisual
y de renta de equipo en México. Una **empresa** se suscribe a la plataforma y activa uno o más
**servicios**; cada servicio es un dominio de negocio completo:

| Servicio (`keycode`) | Qué resuelve |
|---|---|
| `warehouses` | Renta y venta de equipo con inventario a nivel de unidad física, cotizaciones con fiscalidad mexicana y chat en tiempo real con el cliente |
| `productions` | Gestión de rodajes: guion → capítulos → escenas, continuidad, planes de trabajo, presupuesto y compras a almacenes de otras empresas |
| `pixit` | Fabricación de mosaicos de ladrillo a partir de fotos: catálogo, inventario por movimientos y punto de venta |
| `websites` | Constructor de sitios y tiendas públicas servidas por subdominio |
| `locations` | Directorio de locaciones para rodaje |

Sobre esos cinco se apoya un núcleo común: identidad, empresas, membresías, roles, direcciones,
contrapartes, taxonomías, archivos, notificaciones, suscripciones y cobros.

## Por qué existe este directorio

La implementación actual son dos repositorios (`tfv-backend`, `tfv-frontend`, ~200k líneas)
que se van a **reescribir sobre un stack nuevo**. Estas specs son el puente: describen el
comportamiento del sistema de forma **independiente de la implementación**, para que la pila
vieja y la nueva puedan verificarse contra el mismo contrato.

- `specs/` es la verdad vigente: **qué hace el sistema**, sin decir con qué se construye.
- `changes/` son las rebanadas de la migración: **qué cambia y cómo se construye**.

Los nombres de proveedor (Supabase, Stripe, Novu, Hono, Drizzle) **no aparecen en `specs/`**.
Viven en el `design.md` de cada rebanada. Única excepción consciente: `access-control` afirma que
el aislamiento entre arrendatarios debe seguir vigente aunque falle la capa de aplicación, porque
eso es una propiedad observable del sistema y no un detalle de implementación.

## Convenciones de escritura

- **Prosa en español. Palabras clave RFC 2119 en inglés**: `SHALL`, `MUST`, `SHOULD`, `MAY`,
  y `GIVEN` / `WHEN` / `THEN` / `AND` en los escenarios.
- Un requisito = una obligación. Encabezado `### Requirement: <nombre>` de **≤ 50 caracteres**,
  seguido **inmediatamente** de una frase con `SHALL`.
- Todo requisito lleva **al menos un escenario**, y los profundos llevan además al menos uno
  de frontera o de error. Un escenario debe poder convertirse en una prueba automatizada.
- La aritmética y las tablas de estado **se transcriben, no se parafrasean**.
- Los textos de interfaz que el usuario final ve están en español y se citan literalmente
  cuando el texto exacto forma parte del contrato (mensajes de error, etiquetas de estado).

## Base de las specs

Las specs describen el **comportamiento que se pretende**, no el que hoy se observa.
Los defectos confirmados están catalogados en [`DEFECTS.md`](./DEFECTS.md) y **quedan fuera de la
base**: una spec nunca describe un bug como si fuera la norma.

Las mejoras deliberadas —permisos que se aplican, sesiones que caducan, cobro transaccional,
cálculo en el servidor— **sí están en las specs**, porque son el contrato que la implementación
nueva debe cumplir. Cuando un requisito se aparta de lo que hoy hace el sistema, lo dice
explícitamente y cita el defecto correspondiente.

Esto significa que `specs/` describe **el destino**, no el punto de partida. Las rebanadas de
`changes/` no redefinen ese contrato: su trabajo es hacer que la implementación nueva lo satisfaga.
Sólo llevan delta de requisitos las que retiran alcance (ver D-09) o las que descubran, al
implementarse, que una spec estaba equivocada.

## Stack objetivo

```
tfv/
├── openspec/              ← este directorio
├── apps/
│   ├── api/               Node · Hono · Drizzle · PostgreSQL
│   └── web/               Next.js · React · Tailwind
└── packages/
    ├── contracts/         Esquemas compartidos y cliente tipado generado del OpenAPI
    ├── db/                Esquema Drizzle y migraciones
    └── ui/                Sistema de diseño
```

| Capa | Elección | Notas |
|---|---|---|
| Base de datos | **PostgreSQL en Supabase** | Sustituye a MongoDB |
| ORM | **Drizzle** | Migraciones versionadas en `packages/db` |
| API | **Hono + OpenAPI** | Registro explícito de rutas; se abandona el auto-descubrimiento por sistema de archivos |
| Cliente de API | Generado del OpenAPI | Se abandonan los 82 archivos escritos a mano |
| Frontend | **Next.js + React + Tailwind** | Se abandonan Mantine y vanilla-extract |
| Almacenamiento | **Supabase Storage** | Migra desde Google Cloud Storage conservando el protocolo de URL firmada |
| Trabajos en segundo plano | Cola durable | Sincronización de guion, webhooks, expiración de reservas |
| Tiempo real | WebSocket propio + `LISTEN/NOTIFY` | Se conserva el protocolo de chat actual; se resuelve el registro de salas en memoria |
| Autenticación | Implementación propia | **No** se adopta Supabase Auth en la primera pasada — ver decisión D-07 |
| Notificaciones | Novu + FCM | Sin cambio de proveedor |
| Cobros | Stripe (plataforma + Connect) | Sin cambio de proveedor |
| Pruebas | Unitarias + integración + extremo a extremo | Hoy no existe ninguna |

## Decisiones transversales

Estas decisiones están tomadas y las specs las asumen. Cambiarlas obliga a revisar varias
capabilities a la vez, así que se registran aquí y no dentro de cada spec.

### D-01 · Un solo padrón de identidad
Los compradores de las tiendas públicas y los usuarios del panel son **la misma entidad**.
El correo es único a nivel global. Un mismo principal puede ser, a la vez, miembro de una empresa
y comprador en la tienda de otra.

Las specs distinguen siempre el **rol** con el que actúa un principal — `miembro`, `comprador`,
`administrador de plataforma` — y **nunca asumen que sean entidades distintas ni que sean la misma**.
Separarlos más adelante debe ser una rebanada acotada, no una reescritura.

### D-02 · Borrado lógico en entidades de negocio, físico en filas estructurales
Llevan borrado lógico (siguen existiendo, dejan de ser visibles): usuarios, empresas, pedidos,
cotizaciones, pagos, ventas, unidades de stock, productos, producciones, almacenes, sitios.

Se borran físicamente por integridad referencial declarativa: filas de unión, líneas de documento,
membresías, comentarios, actividades, movimientos de inventario.

Consecuencias que las specs deben respetar:
- Toda lectura de colección excluye lo borrado salvo que se pida explícitamente lo contrario.
- Las restricciones de unicidad son **parciales**: un correo liberado por un borrado lógico
  vuelve a estar disponible.
- Las ~20 funciones de cascada escritas a mano desaparecen; la propagación es declarativa.

### D-03 · Dinero en decimal exacto, redondeo por línea
Los importes se almacenan con **dos decimales exactos** (nunca coma flotante).

```
línea.total  = round(precio × cantidad, 2)
subtotal     = Σ línea.total
descuento    = round(subtotal × porcentaje, 2)
impuesto     = round(base × porcentaje, 2)
```

Cada línea se redondea antes de sumarse, de modo que un documento impreso siempre cuadra con su
total. Al integrarse con el procesador de pagos, el importe se convierte a la unidad mínima
(`round(total × 100)`).

Cuando una comisión se prorratea entre líneas y el reparto no es exacto, **el residuo se asigna a
la última línea**; la spec correspondiente lo establece explícitamente.

### D-04 · Identificadores
Identificadores opacos y ordenables por tiempo. Las specs no dependen de su formato salvo en dos
puntos que sí son contrato observable:

- Toda lectura pública acepta **identificador o slug** indistintamente en la misma posición
  de la ruta.
- Durante la transición, los identificadores de la pila anterior (24 caracteres hexadecimales)
  siguen resolviéndose, porque están incrustados en URLs públicas ya compartidas.

### D-05 · Marcas de tiempo
Toda entidad expone fecha de creación y de última modificación, con zona horaria explícita,
en formato ISO 8601 y en UTC.

### D-06 · Aislamiento entre arrendatarios en dos capas
El aislamiento se cumple **en la aplicación y en el motor de datos**, no en una sola.

Hoy el alcance depende únicamente del parámetro de ruta y ningún manejador verifica pertenencia:
pedir `/company/<id ajeno>/...` devuelve datos de otra empresa. Eso desaparece.

Advertencia de diseño que la rebanada correspondiente debe resolver: una credencial de servicio
**omite las políticas del motor por completo**. Para que la segunda capa sirva de algo, la
identidad del solicitante tiene que propagarse a la base en cada transacción.

### D-07 · Autenticación delegada al servicio gestionado
**Revisada el 2026-08-16.** La versión anterior de esta decisión posponía adoptar el servicio de
autenticación gestionado. Se adopta ahora, junto con las políticas de aislamiento del motor.

El motivo del cambio: las políticas del motor resuelven la identidad leyendo los claims del token
del servicio gestionado, así que usarlo evita mantener dos nociones de identidad en paralelo.

Lo que **no** cambia es cómo llega esa identidad a la base. Comprobado contra el motor: con una
conexión directa —que es la que usa la capa de datos— **nadie fija los claims por nosotros**. Hay
que propagarlos en cada transacción, igual que si la autenticación fuese propia. La elección cambia
de dónde sale la identidad, no cómo llega.

Consecuencias que las specs deben reflejar:

- La identidad de referencia pasa a ser la del servicio gestionado, y los datos de perfil cuelgan
  de ella.
- **La revocación inmediata deja de ser gratuita, y se paga.** El token es autocontenido, así que
  por sí solo seguiría sirviendo hasta caducar. Se resuelve consultando la base en cada
  transacción, no aceptando la ventana: **las specs no se modifican**.

  Comprobado contra el servicio real, no supuesto: el token declara su sesión, cerrar sesión borra
  el registro, y **el propio servicio gestionado ya hace esa consulta** —con un token sin caducar
  pero cerrado responde `403`—. No hacerla nos dejaría más débiles que el servicio que adoptamos.
  Cuesta `0.023 ms` y no añade viaje de ida y vuelta, porque ya se abre una transacción por
  petición para fijar los claims.

  Se hace cumplir **en el motor**: toda política resuelve la identidad por una única función que
  devuelve nulo si la sesión se cerró o la cuenta dejó de estar vigente. Ninguna política llama a
  la identidad cruda, y la migración falla si alguna lo hiciera.

  Coste anotado: ata el motor al registro de sesiones del proveedor, que es esquema interno suyo.
  Es acoplamiento real; se acepta porque vive en un único predicado de una única función.

### D-08 · Búsqueda
La búsqueda por texto es insensible a mayúsculas y a acentos, y admite coincidencia parcial.
Cada recurso declara **qué campos participan**; ese registro vive en `query-and-pagination` y es
parte del contrato, no un detalle de implementación.

### D-09 · Fuera de alcance
Estas superficies existen hoy y **no se reimplementan**. Cada una es un requisito `REMOVED`
explícito en su rebanada, para que quede constancia de que se retiraron a propósito:

| Superficie | Motivo |
|---|---|
| Reservas de locaciones | Funcionalidad abandonada a medias: su ruta de actualización nunca llegó a registrarse y no existe ninguna pantalla que la consuma. Redes y locaciones sí se conservan. |
| Administración de plantillas de notificación por API | Herramienta de administración expuesta sin autenticación que opera sobre la cuenta real del proveedor. Se administra desde el panel del proveedor. |
| Página HTML de bienvenida y endpoints de prueba | Andamiaje de la plantilla original. Los sustituyen un endpoint de salud y la publicación del OpenAPI. |

Los manejadores de lectura rotos de pedidos, pagos, checkouts y pedidos de Pixit **sí siguen en
alcance**: se especifica el comportamiento correcto (devolver la entidad que el endpoint anuncia).

## Glosario

El vocabulario está congelado en [`GLOSARIO.md`](./GLOSARIO.md) y es de lectura obligada antes de
escribir o revisar una spec. Importa especialmente porque **la palabra "pedido" designa cuatro
entidades distintas** en este sistema.

## Mapa de capabilities

Las 45 capabilities agrupadas por afinidad. La profundidad indica cuánto comportamiento no trivial
contienen: **T** trivial (CRUD), **M** medio, **D** profundo.

### Contratos de plataforma
| Capability | Propósito | |
|---|---|---|
| `api-conventions` | Forma de recurso, validación, serialización estricta, contrato de errores, idempotencia | D |
| `query-and-pagination` | Lenguaje de consulta, filtros, orden, búsqueda y sobre de paginación | D |
| `computed-fields` | Campos derivados que son lógica de negocio | D |
| `access-control` | Roles, permisos, alcance de arrendatario, administración de plataforma | D |
| `activity-and-notifications` | Bitácora de actividad, selección de audiencia y entrega | D |

### Servicios de plataforma y contratos de interfaz
| Capability | Propósito | |
|---|---|---|
| `media-storage` | Subida directa firmada, variantes, marcadores de posición, borrado | D |
| `pdf-documents` | Documentos generados y enlaces públicos para compartirlos | M |
| `app-shell` | Guardas de ruta, navegación, cambio de empresa, tema, idioma | M |
| `collection-browsing` | Listado universal: búsqueda, filtros, paginación, estados vacío/carga/error | M |
| `forms-and-wizards` | Formularios, asistentes por pasos, confirmación destructiva, firma | M |

### Identidad y arrendatarios
| Capability | Propósito | |
|---|---|---|
| `user-accounts` | Registro, sesión, contraseña, verificación, perfil, prospectos | D |
| `companies` | Empresa, propiedad, membresía, invitación, transferencia | D |
| `addresses` | Libretas de direcciones de usuario y de empresa | T |
| `clients-and-providers` | Contrapartes comerciales de una empresa | T |
| `category-trees` | Taxonomías jerárquicas global, por almacén y por producción | M |
| `subscriptions-and-entitlements` | Planes, suscripción, asientos y servicios habilitados | D |

### Dinero
| Capability | Propósito | |
|---|---|---|
| `merchant-onboarding` | Alta del comercio para recibir cobros | D |
| `payment-webhooks` | Recepción verificada de eventos del procesador | D |
| `storefront-checkout` | Carrito, validación de existencias, precio y sesión de pago | D |
| `shipping-rates` | Cálculo de costo de envío | M |
| `order-fulfillment` | Materialización del pedido pagado | D |

### Almacenes
| Capability | Propósito | |
|---|---|---|
| `warehouses-and-storage` | Almacén y árbol de ubicaciones físicas | M |
| `warehouse-catalog` | Producto, variantes, medidas y listas de precios | D |
| `stock-units` | Unidades físicas individuales y sus estados | D |
| `warehouse-orders` | Ciclo de vida del pedido de almacén | D |
| `order-chat` | Conversación en tiempo real cliente ↔ proveedor | D |
| `quotations` | Documento comercial de cotización | D |
| `quotation-pricing` | Motor de cálculo de la cotización | D |
| `stock-reservation` | Máquina de estados entre cotización y unidades | D |

### Producciones
| Capability | Propósito | |
|---|---|---|
| `production-management` | Producción, personajes, sets y videos | M |
| `script-breakdown` | Guion, capítulos y escenas | M |
| `script-ai-sync` | Extracción asistida de capítulos y escenas desde el guion | D |
| `continuity-tracking` | Jornadas de rodaje, continuidad y utilería | M |
| `production-inventory` | Catálogo de utilería y notas de entrega | M |
| `production-workflows` | Planes de trabajo, tareas y actividades | M |
| `production-budget` | Presupuestado contra gastado | M |
| `production-procurement` | Compra a almacenes de otras empresas y su liquidación | D |

### Pixit
| Capability | Propósito | |
|---|---|---|
| `pixit-catalog` | Datos maestros: tableros, láminas, colores, tiendas | T |
| `pixit-inventory-ledger` | Inventario por movimientos | D |
| `mosaic-generation` | Conversión de foto a mosaico y lista de materiales | D |
| `pixit-point-of-sale` | Sesión de caja, cobro y asiento de venta | D |

### Sitios web y locaciones
| Capability | Propósito | |
|---|---|---|
| `websites` | Registro de sitio, resolución por subdominio y compuertas de acceso | D |
| `site-builder` | Constructor de secciones y temas programados | M |
| `public-storefronts` | Tiendas públicas y cuenta del comprador | M |
| `locations-directory` | Redes y locaciones para rodaje | T |
