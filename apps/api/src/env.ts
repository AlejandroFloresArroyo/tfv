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

const schema = z
  .object({
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

    /**
     * El secreto compartido con el procesador de pagos.
     *
     * **Obligatorio en producción**, y por eso lo comprueba el refinamiento de abajo. Fuera de
     * producción es opcional para que levantar el servicio no exija una cuenta del procesador; sin
     * él, el endpoint de eventos rechaza **todo**, que es lo contrario de lo que hacía la
     * implementación anterior — donde el valor por defecto era la palabra `secret` (`DEFECTS.md`
     * S-13) y cualquiera que la conociera podía firmar.
     *
     * Nunca hay un valor por defecto. Un secreto con valor por defecto es un secreto público.
     */
    PAYMENTS_WEBHOOK_SECRET: z.string().min(1).optional(),

    /** Tolerancia de la marca de tiempo firmada, en segundos. Impide reproducir eventos capturados. */
    PAYMENTS_WEBHOOK_TOLERANCE: z.coerce.number().int().positive().default(300),

    /**
     * El secreto con el que se firman los enlaces públicos de los documentos.
     *
     * Es lo único que hace impredecible la referencia de un enlace compartido: quien la altera
     * recibe `404`. **Obligatorio en producción**, y sin valor por defecto nunca — un secreto con
     * valor por defecto es un secreto público (`DEFECTS.md` S-13).
     *
     * Fuera de producción, su ausencia hace que el servicio firme con un secreto al azar por
     * proceso: los enlaces valen mientras el servicio viva. Rotarlo invalida todos los enlaces
     * repartidos, que es la única forma de revocarlos.
     */
    DOCUMENTS_LINK_SECRET: z.string().min(32).optional(),

    /**
     * El almacenamiento de objetos, y la credencial con la que se le pide permiso.
     *
     * Los bytes **no pasan por aquí**: la API firma una autorización de escritura acotada a un
     * objeto concreto y con caducidad, y el navegador escribe directo. Por eso este servicio no
     * necesita aceptar cargas grandes y por eso la credencial de servicio no sale nunca de aquí:
     * lo que viaja al navegador es la autorización, no la llave.
     */
    STORAGE_URL: z.string().url().default("http://127.0.0.1:54321/storage/v1"),
    STORAGE_BUCKET: z.string().min(1).default("tfv"),
    /** **Obligatoria en producción**, como el secreto del procesador de pagos y por lo mismo. */
    STORAGE_SERVICE_KEY: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.STORAGE_SERVICE_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_SERVICE_KEY"],
        message:
          "En producción es obligatoria: sin ella no se puede firmar ninguna subida, y toda " +
          "pantalla que suba un archivo queda inservible.",
      })
    }

    if (value.NODE_ENV === "production" && !value.PAYMENTS_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_WEBHOOK_SECRET"],
        message:
          "En producción es obligatorio: sin él, el endpoint de eventos de pago no puede verificar " +
          "nada y queda abierto a cualquiera que publique un evento falso.",
      })
    }

    if (value.NODE_ENV === "production" && !value.DOCUMENTS_LINK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["DOCUMENTS_LINK_SECRET"],
        message:
          "En producción es obligatorio: firma los enlaces públicos de los documentos, y sin él " +
          "no sobreviven a un reinicio ni a un segundo proceso sirviendo la misma aplicación.",
      })
    }
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
