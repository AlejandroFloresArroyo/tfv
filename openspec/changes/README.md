# Rebanadas de la migración

Treinta rebanadas que llevan la implementación desde los dos repositorios actuales hasta el stack
objetivo, cumpliendo las specs de [`../specs/`](../specs/).

Cada rebanada tiene una intención que cabe en una frase, un `proposal.md` con su alcance y sus
criterios de aceptación, y un `tasks.md` con su lista de trabajo.

## Bloque crítico de seguridad

**Las rebanadas 04 a 07 deben entregarse antes de que tráfico público toque la pila nueva.**

Hoy los tokens no caducan, los 255 permisos no se aplican como control de acceso, el parámetro de
ruta concede acceso a cualquier arrendatario y cualquiera puede falsificar un evento de pago. Poner
en producción una pila nueva con esos cuatro agujeros abiertos sería reproducirlos, no migrarlos.

## Secuencia

```
01 ─ 02 ─ 03 ─┬─ 04 ─ 05 ─ 06 ──────────────────────┐
              │                                      │
              ├─ 07 ─ 11 ──────────────────────┐     │
              ├─ 08                            │     │
              ├─ 09                            │     │
              └─ 10 ─┬─ 12 ─ 13 ─ 14 ─ 15 ─ 16 ─┴─ 17 ─ 18 ─ 19
                     ├─ 20 ─ 21 ─ 22 ──────────────────┬─ 23
                     ├─ 24 ─ 25 ─ 26                   │
                     └─ 27                             │
                                                       │
28 (a→f) ─ 29 (a…e) ───────────────────────────────────┴─ 30
```

Las dos columnas de dominio —comercio (12→18) y producciones (20→22)— avanzan en paralelo tras la
10 y convergen en la 23. La reconstrucción de interfaz (28, 29) puede empezar en cuanto esté la 03 y
avanza en su propia vía.

## Índice

| # | Rebanada | Intención | Capabilities |
|---|---|---|---|
| 01 | [`add-platform-contracts`](./add-platform-contracts/) | Contrato HTTP, lenguaje de consulta y campos calculados | `api-conventions`, `query-and-pagination`, `computed-fields` |
| 02 | [`add-postgres-data-model`](./add-postgres-data-model/) | Traducir 90 colecciones a esquema relacional con integridad real | todas |
| 03 | [`add-hono-api-runtime`](./add-hono-api-runtime/) | Registro explícito de rutas, validación y publicación del contrato | `api-conventions` |
| 04 | [`add-session-lifecycle`](./add-session-lifecycle/) | Sesiones con vigencia, refresco rotatorio y recuperación segura | `user-accounts` |
| 05 | [`add-authorization-enforcement`](./add-authorization-enforcement/) | Los permisos pasan de selector de audiencia a compuerta de acceso | `access-control` |
| 06 | [`add-tenant-scoping`](./add-tenant-scoping/) | Aislamiento entre arrendatarios en aplicación y en el motor | `access-control` |
| 07 | [`add-verified-payment-webhooks`](./add-verified-payment-webhooks/) | Verificar la firma, deduplicar y atender los eventos que faltan | `payment-webhooks` |
| 08 | [`migrate-media-storage`](./migrate-media-storage/) | Portar el almacenamiento conservando la subida directa firmada | `media-storage` |
| 09 | [`migrate-activity-and-notifications`](./migrate-activity-and-notifications/) | Bitácora transaccional y entrega encolada | `activity-and-notifications` |
| 10 | [`migrate-identity-and-companies`](./migrate-identity-and-companies/) | Cuentas, empresas, membresías, direcciones, contrapartes, taxonomías | `user-accounts`, `companies`, `addresses`, `clients-and-providers`, `category-trees` |
| 11 | [`migrate-subscriptions-and-billing`](./migrate-subscriptions-and-billing/) | Planes, suscripciones, asientos y alta de comercio | `subscriptions-and-entitlements`, `merchant-onboarding` |
| 12 | [`migrate-warehouse-catalog`](./migrate-warehouse-catalog/) | Almacenes, ubicaciones, catálogo, medidas, precios y unidades | `warehouses-and-storage`, `warehouse-catalog`, `stock-units` |
| 13 | [`add-transactional-stock-reservation`](./add-transactional-stock-reservation/) | Reserva con bloqueo de fila y acuñación sólo autorizada | `stock-reservation` |
| 14 | [`add-server-side-quotation-pricing`](./add-server-side-quotation-pricing/) | El motor de cálculo pasa al servidor y se congela al cerrar | `quotation-pricing`, `quotations` |
| 15 | [`migrate-warehouse-orders`](./migrate-warehouse-orders/) | Ciclo de pedidos con aceptación atómica y propagación de rechazo | `warehouse-orders` |
| 16 | [`migrate-order-chat-realtime`](./migrate-order-chat-realtime/) | Chat autenticado al conectar y salas entre instancias | `order-chat` |
| 17 | [`migrate-shipping-rates`](./migrate-shipping-rates/) | Una sola implementación, con tarifas configurables | `shipping-rates` |
| 18 | [`add-transactional-checkout`](./add-transactional-checkout/) | Reserva con caducidad y materialización idempotente | `storefront-checkout`, `order-fulfillment` |
| 19 | [`migrate-websites-and-site-builder`](./migrate-websites-and-site-builder/) | Sitios, resolución por subdominio y constructor | `websites`, `site-builder`, `public-storefronts` |
| 20 | [`migrate-productions-core`](./migrate-productions-core/) | Producción, guion, capítulos, escenas y continuidad | `production-management`, `script-breakdown`, `continuity-tracking` |
| 21 | [`add-durable-script-sync`](./add-durable-script-sync/) | La extracción del guion como trabajo durable con progreso visible | `script-ai-sync` |
| 22 | [`migrate-productions-operations`](./migrate-productions-operations/) | Inventario, entregas, planes de trabajo y presupuesto | `production-inventory`, `production-workflows`, `production-budget` |
| 23 | [`add-transactional-procurement`](./add-transactional-procurement/) | Abanico y liquidación transaccionales entre arrendatarios | `production-procurement` |
| 24 | [`migrate-pixit-catalog-and-ledger`](./migrate-pixit-catalog-and-ledger/) | Datos maestros y libro de inventario de sólo anexado | `pixit-catalog`, `pixit-inventory-ledger` |
| 25 | [`add-server-side-pos-sales`](./add-server-side-pos-sales/) | El cobro del mostrador pasa a ser una transacción de servidor | `pixit-point-of-sale` |
| 26 | [`migrate-mosaic-generation`](./migrate-mosaic-generation/) | Portar el generador y conservar el diseño en los pedidos web | `mosaic-generation` |
| 27 | [`migrate-locations-directory`](./migrate-locations-directory/) | Redes y locaciones; se retiran las reservas | `locations-directory` |
| 28 | [`rebuild-ui-foundation`](./rebuild-ui-foundation/) | Sistema de diseño y contratos de interfaz sobre Tailwind | `app-shell`, `collection-browsing`, `forms-and-wizards`, `pdf-documents` |
| 29 | [`rebuild-ui-domain-screens`](./rebuild-ui-domain-screens/) | Pantallas por dominio sobre los primitivos nuevos | todas las de dominio |
| 30 | [`add-data-migration-and-cutover`](./add-data-migration-and-cutover/) | Trasvase de datos, verificación y retirada de la pila anterior | — |

## Rebanadas que retiran alcance

Tres superficies no se reimplementan (ver `project.md`, D-09). Cada una lleva su delta de requisitos
`REMOVED` en la rebanada correspondiente, para que quede constancia de que se retiraron a propósito:

| Superficie | Rebanada |
|---|---|
| Reservas de locaciones | 27 |
| Administración de plantillas de notificación por API | 09 |
| Página de bienvenida y endpoints de prueba | 03 |

## Cómo leer una rebanada

`proposal.md` responde a por qué existe la rebanada, qué entra y qué no, y cómo se sabe que está
terminada. `tasks.md` es la lista de trabajo. Algunas llevan `design.md` cuando hay decisiones
técnicas propias de la migración que no pertenecen al contrato duradero —ése vive junto a la spec.
