# TFV — The Film Vault

Plataforma SaaS multi-arrendatario (*multi-tenant*) para la industria audiovisual, cinematográfica y de renta de equipo en México.

---

## 🏗️ Estructura del Monorepo

El proyecto está organizado como un monorepo administrado con **pnpm workspaces** y **Turborepo**:

```text
tfv/
├── openspec/            ← Especificación formal (45 capabilities, 30 rebanadas)
├── docs/                ← Documentación técnica y guías de onboarding
├── apps/
│   ├── api/             ← API REST (Node.js 22 · Hono · Zod OpenAPI · Drizzle)
│   ├── web/             ← Panel y Storefronts (Next.js 16 · React 19 · Tailwind)
│   └── e2e/             ← Pruebas de extremo a extremo (Playwright)
├── packages/
│   ├── contracts/       ← Lógica pura, esquemas compartidos, permisos y dinero exacto
│   ├── db/              ← Esquema Drizzle (PostgreSQL), migraciones y políticas RLS
│   └── ui/              ← Sistema de diseño, tokens y componentes accesibles
└── supabase/            ← Configuración del stack local de PostgreSQL y Auth
```

---

## 🚀 Inicio Rápido (En menos de 5 minutos)

### Requisitos previos
- **Node.js**: `>= 22.0.0`
- **pnpm**: `>= 10.0.0`
- **Docker Desktop** o **OrbStack** (para la base de datos local con Supabase)

### 1. Clonar e instalar dependencias
```bash
pnpm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
```
*(Los valores por defecto de `.env.example` funcionan directamente con la base de datos local de Supabase).*

### 3. Levantar la base de datos y sembrar datos
```bash
pnpm db:up          # Inicia el contenedor de Supabase (PostgreSQL 18 + Auth)
pnpm db:migrate     # Aplica las migraciones Drizzle y políticas RLS
pnpm db:seed        # Siembra datos de prueba (empresas, usuarios y roles)
```

### 4. Iniciar servidores de desarrollo
```bash
pnpm dev
```
- **Web (Panel y tiendas)**: [http://localhost:3000](http://localhost:3000)
- **API (Hono REST)**: [http://localhost:5000](http://localhost:5000)
- **OpenAPI JSON**: [http://localhost:5000/doc](http://localhost:5000/doc)
- **Supabase Studio (BD UI)**: [http://localhost:54323](http://localhost:54323)

---

## 🔑 Cuentas de Prueba para Desarrollo

Todas las cuentas generadas por `pnpm db:seed` comparten la contraseña: `Desarrollo.2026`

| Correo | Rol / Perfil | Propósito de Prueba |
|---|---|---|
| `admin@tfv.dev` | Administrador de Plataforma | Acceso global a todas las empresas; prueba el selector y cambio de empresa. |
| `duena@tfv.dev` | Propietaria de empresa | Control total de *Renta Fílmica del Norte*; se salta la matriz de permisos. |
| `almacenista@tfv.dev` | Rol acotado (Almacén) | Tiene solo 5 de 255 permisos; ideal para verificar que las compuertas y botones se bloquean. |
| `compradora@tfv.dev` | Compradora de tienda | Sin membresías de empresa; valida el padrón único de identidad. |

---

## 🧪 Pruebas y Calidad de Código

```bash
pnpm check           # Verifica tipos TypeScript en todos los paquetes (tsc --noEmit)
pnpm lint            # Análisis estático y formateo rápido con Biome
pnpm test            # Pruebas unitarias y de integración (Vitest)
pnpm test:e2e        # Pruebas E2E en navegador contra build de producción (Playwright)
```

> ⚠️ **Nota sobre `pnpm test`:** Actualmente la suite de integración de la API trunca tablas de la base local. Si ejecutas `pnpm test`, vuelve a correr `pnpm db:seed` para restaurar los datos de navegación.

---

## 📚 Documentación Adicional

- [📘 Guía de Onboarding Paso a Paso](docs/ONBOARDING.md) — Explicación detallada del entorno y flujos cotidianos.
- [🏛️ Arquitectura del Sistema](docs/ARCHITECTURE.md) — Multi-tenancy, RLS en dos capas, BFF en Next.js y los 5 servicios.
- [🛠️ Guía de Desarrollo y Convenciones](docs/DEVELOPMENT_GUIDE.md) — Cómo agregar tablas, endpoints, permisos y pantallas respetando OpenSpec.
- [🔎 Hallazgos de Implementación](openspec/HALLAZGOS.md) — Lo que apareció al construir: specs que no se sostenían, huecos y decisiones pendientes.
- [📜 Glosario de Términos](openspec/GLOSARIO.md) — Vocabulario oficial (ej. la distinción entre los 4 tipos de "pedidos").
- [📋 Plan de Implementación](IMPLEMENTATION.md) — Estado vivo del avance de la migración y rebanadas de trabajo.
