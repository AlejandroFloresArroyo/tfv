# 📘 Guía de Onboarding para Desarrolladores

Bienvenido al equipo de ingeniería de **TFV (The Film Vault)**. Esta guía está diseñada para que puedas configurar tu entorno local y hacer tu primera contribución de forma fluida.

---

## 1. Contexto Rápido: ¿Qué estamos construyendo?

TFV es una plataforma SaaS modular que sustituye a una arquitectura heredada. El sistema permite a empresas audiovisuales y creativas gestionar:
1. **`warehouses`**: Inventario de cámaras/lentes a nivel de unidad física, cotizaciones con impuestos mexicanos y chat en tiempo real.
2. **`productions`**: Rodajes, guiones (extracción con IA), desglose de escenas, continuidad de utilería y presupuestos.
3. **`pixit`**: Fabricación y venta de mosaicos de bloques estilo LEGO a partir de fotos (POS e inventario por libro mayor).
4. **`websites`**: Tiendas públicas y constructor de sitios servidos por subdominio.
5. **`locations`**: Directorio de locaciones para filmación.

---

## 2. Configuración Inicial del Entorno

### Requisitos de Sistema
- **Node.js**: `v22.x` o superior (se recomienda usar `nvm`, `fnm` o `asdf`).
- **pnpm**: `v10.x` o `v11.x` (`corepack enable && corepack prepare pnpm@latest --activate`).
- **Docker**: Docker Desktop / OrbStack corriendo localmente.

### Paso a paso
1. **Clonar el repositorio:**
   ```bash
   git clone <url-del-repo> tfv
   cd tfv
   ```

2. **Instalar dependencias:**
   ```bash
   pnpm install
   ```

3. **Variables de entorno:**
   ```bash
   cp .env.example .env
   ```
   *No requieres modificar ninguna variable para el entorno local; el archivo viene preconfigurado para comunicarse con la base de datos de desarrollo.*

4. **Levantar PostgreSQL con Supabase:**
   ```bash
   pnpm db:up
   ```
   *Esto descargará y levantará los contenedores de Postgres 18, Auth (GoTrue) y Storage.*

5. **Aplicar migraciones y sembrar datos:**
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

6. **Arrancar la plataforma:**
   ```bash
   pnpm dev
   ```

---

## 3. Topología de Servicios Locales

Cuando ejecutas `pnpm dev`, Turborepo levanta concurrentemente:

| Servicio | URL Local | Descripción |
|---|---|---|
| **Aplicación Web** | `http://localhost:3000` | Frontend Next.js 16 con App Router. |
| **API Backend** | `http://localhost:5000` | Servidor Hono con OpenAPI. |
| **OpenAPI Docs** | `http://localhost:5000/doc` | Esquema OpenAPI JSON generado en vivo. |
| **Supabase Studio** | `http://localhost:54323` | Interfaz gráfica web para explorar tablas y ejecutar SQL. |
| **PostgreSQL** | `localhost:54322` | Conexión directa a la BD (`postgres://postgres:postgres@127.0.0.1:54322/postgres`). |

---

## 4. Cuentas de Acceso y Perfiles de Prueba

Para probar diferentes permisos y comportamientos en la interfaz, usa estas credenciales (todas con la contraseña `Desarrollo.2026`):

1. **`admin@tfv.dev` (Administrador de Plataforma):**
   * Puede acceder a cualquier empresa de la plataforma mediante el selector en la barra superior.
2. **`duena@tfv.dev` (Propietaria):**
   * Es dueña de *Renta Fílmica del Norte*. Se salta cualquier restricción de rol dentro de su empresa.
3. **`almacenista@tfv.dev` (Rol Acotado):**
   * Empleado con solo 5 permisos de inventario. Úsala para verificar que las secciones restringidas muestren mensajes de error o compuertas bloqueadas.
4. **`compradora@tfv.dev` (Compradora Pública):**
   * Usuario sin empresas asignadas. Simula a un cliente final que adquiere productos en una tienda web.

---

## 5. Comandos y Flujo de Trabajo Diario

### Verificación antes de hacer Commit
Antes de abrir un Pull Request o solicitar revisión, ejecuta:
```bash
# 1. Comprobar que TypeScript no tiene errores en ningún paquete
pnpm check

# 2. Formatear y verificar linter con Biome
pnpm format
pnpm lint

# 3. Ejecutar las pruebas unitarias y de integración
pnpm test
```

### Comandos útiles de Base de Datos
```bash
pnpm db:status    # Ver el estado de los contenedores locales de Supabase
pnpm db:down      # Detener los contenedores locales
pnpm db:reset     # Reiniciar la base de datos limpia desde cero
pnpm db:studio    # Abrir Supabase Studio en el navegador
```
