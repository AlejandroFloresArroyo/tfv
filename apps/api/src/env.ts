/**
 * Configuración del servicio, validada al arrancar.
 *
 * Ver `openspec/changes/add-hono-api-runtime`.
 *
 * **El servicio no arranca si falta algo.** La implementación anterior tenía valores por defecto
 * para todo —incluido el secreto de firma, cuyo valor literal era `"secret"` (`DEFECTS.md` S-13)—
 * así que podía levantarse en producción sin configurar y nadie se enteraba hasta que algo fallaba
 * de forma rara.
 */

import { z } from "zod"

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(5000),
  API_HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().min(1, "Sin base de datos el servicio no puede atender nada"),

  /**
   * Orígenes permitidos, separados por comas.
   *
   * Enumerados de forma explícita: nunca comodín. La implementación anterior combinaba origen
   * comodín con envío de credenciales, que es una combinación que los navegadores rechazan y que
   * enmascaraba qué orígenes se pretendían permitir (`DEFECTS.md` S-12).
   */
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .refine((origins) => !origins.includes("*"), {
      message: "No se admite un origen comodín. Enumera los orígenes permitidos.",
    }),

  /**
   * Prefijo bajo el que el navegador ve la API.
   *
   * Existe por una sola razón: **la credencial de renovación viaja con `Path=/auth`**, para no
   * enviarse en cada petición. Cuando la aplicación web sirve la API tras un proxy —`/api/auth/…`
   * en su propio origen, que es como se evita el envío entre orígenes— el camino que el navegador
   * ve ya no es el que la cookie declara, y la cookie deja de enviarse a su propia ruta.
   *
   * Poniendo aquí el mismo prefijo que usa el proxy, la restricción se conserva en lugar de
   * relajarse a `/`, que es la salida fácil y la que anula la propiedad.
   */
  COOKIE_PATH_PREFIX: z
    .string()
    .default("")
    .refine((value) => value === "" || (value.startsWith("/") && !value.endsWith("/")), {
      message: 'Debe empezar por "/" y no terminar en "/", o quedar vacío.',
    }),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
    .join("\n")

  throw new Error(`Configuración inválida. Revisa el entorno:\n${detail}`)
}

export const env = parsed.data

export const isProduction = env.NODE_ENV === "production"

/** El detalle técnico de los errores sólo sale fuera de producción. */
export const exposeErrorDetails = !isProduction
