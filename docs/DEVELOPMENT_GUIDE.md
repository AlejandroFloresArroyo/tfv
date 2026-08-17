# 🛠️ Guía de Desarrollo y Flujo de Trabajo

Esta guía explica paso a paso cómo implementar nuevas funcionalidades, agregar tablas de base de datos, crear endpoints en la API y construir interfaces en el frontend siguiendo las directivas de **OpenSpec**.

---

## 1. El Flujo de Trabajo OpenSpec

Cualquier cambio de dominio significativo sigue esta secuencia:

1. **Revisar la especificación en `openspec/specs/`:**
   * Entiende los requisitos (`SHALL`), los escenarios (`GIVEN / WHEN / THEN`) y revisa que el vocabulario respete [`openspec/GLOSARIO.md`](../openspec/GLOSARIO.md).
2. **Revisar la rebanada correspondiente en `openspec/changes/`:**
   * Revisa `proposal.md` y `tasks.md` de la rebanada en la que estás trabajando.
3. **Escribir pruebas primero:**
   * Los escenarios de las especificaciones deben traducirse directamente a pruebas en Vitest o Playwright.
4. **Implementar y verificar:**
   * Asegúrate de que `pnpm check`, `pnpm lint` y `pnpm test` pasen antes de considerar una tarea cerrada.

---

## 2. Cómo agregar o modificar tablas en la Base de Datos (`packages/db`)

### Paso 1: Definir la tabla en Drizzle
Edita o crea un archivo en `packages/db/src/schema/` (por ejemplo, `warehouse-commerce.ts`):

```typescript
import { pgTable, varchar, text, index } from "drizzle-orm/pg-core"
import { primaryId, reference, softDelete, timestamps } from "./_shared.ts"
import { companies } from "./identity.ts"

export const miTabla = pgTable(
  "mi_tabla",
  {
    id: primaryId(),
    companyId: reference("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("mi_tabla_company_idx").on(table.companyId),
  ],
)
```

### Paso 2: Exportar en el índice
Asegúrate de re-exportar tu tabla en `packages/db/src/schema/index.ts`.

### Paso 3: Generar y aplicar la migración
```bash
# 1. Genera el archivo SQL de migración en packages/db/drizzle/
pnpm db:generate

# 2. Aplica la migración a la base local
pnpm db:migrate
```

### Paso 4: Añadir la política RLS (Row Level Security)
Toda tabla perteneciente a una empresa **debe** tener su política RLS en `packages/db/drizzle/` o `schema/` para no fallar las pruebas de aislamiento (`packages/db/src/rls-policies.test.ts`).

---

## 3. Cómo crear un nuevo Endpoint en la API (`apps/api`)

Las rutas se declaran con **`@hono/zod-openapi`** para que el contrato y la validación estén siempre sincronizados:

### Paso 1: Declarar la ruta y el esquema Zod
En `apps/api/src/routes/mi-dominio.ts`:

```typescript
import { createRoute, z } from "@hono/zod-openapi"
import { withRequester } from "@tfv/db"
import { guardFor } from "../auth/middleware.ts"
import { registerRoute } from "../runtime/route.ts"

const MiRecursoSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const getMiRecursoRoute = createRoute({
  method: "get",
  path: "/companies/{companyId}/mi-recurso",
  tags: ["MiDominio"],
  summary: "Obtener lista de recursos",
  middleware: [guardFor({ permission: "warehouses.products.view" })] as const,
  request: {
    params: z.object({
      companyId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Lista obtenida con éxito",
      content: {
        "application/json": {
          schema: z.array(MiRecursoSchema),
        },
      },
    },
  },
})

// Registrar la ruta en el runtime
export const miRecursoRoutes = [
  registerRoute(getMiRecursoRoute, async (c) => {
    const requester = c.get("requester")
    const { companyId } = c.req.valid("param")

    const data = await withRequester(requester, async (tx) => {
      // Las consultas aquí corren bajo RLS de PostgreSQL
      return await tx.query.miTabla.findMany({
        where: (t, { eq }) => eq(t.companyId, companyId),
      })
    })

    return c.json(data, 200)
  }),
]
```

### Paso 2: Conectar la ruta
Añade `miRecursoRoutes` al arreglo principal en `apps/api/src/routes/index.ts`.

---

## 4. Cómo construir una nueva Pantalla en Next.js (`apps/web`)

### Componentes de Servidor vs. Cliente
- **Por defecto, crea Server Components (`async function Page()`)** para realizar lecturas de datos directas o iniciales.
- Usa `'use client'` solo en componentes interactivos que manejen estado local, diálogos o formularios.

### Uso del Sistema de Diseño (`@tfv/ui`)
Importa siempre los componentes primitivos de `@tfv/ui`:

```tsx
import { Button } from "@tfv/ui/components/button"
import { TextField } from "@tfv/ui/components/field"
import { Card, CardHeader, CardContent } from "@tfv/ui/components/surfaces"
```

### Internacionalización (`next-intl`)
Todos los textos visibles deben registrarse en `apps/web/src/i18n/messages/es.json` y `en.json`:

```tsx
import { useTranslations } from "next-intl"

export function MiComponente() {
  const t = useTranslations("miSeccion")
  return <h1>{t("titulo")}</h1>
}
```

---

## 5. Lista de Verificación para Pull Requests (PR Checklist)

- [ ] ¿El código respeta el glosario oficial ([`GLOSARIO.md`](../openspec/GLOSARIO.md))?
- [ ] ¿Los importes monetarios usan `money(...)` y aritmética exacta de `@tfv/contracts`?
- [ ] ¿Las consultas de base de datos corren dentro de `withRequester` o `withSystem`?
- [ ] ¿Se crearon o actualizaron las pruebas unitarias (`pnpm test`)?
- [ ] ¿`pnpm check` compila al 100% sin errores de tipos?
- [ ] ¿`pnpm lint` pasa limpiamente con Biome?
