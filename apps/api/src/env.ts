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
     * Qué procesador de pagos hay puesto.
     *
     * `none` —lo de fábrica— falla en toda operación de cobro diciendo qué falta. `local` es un
     * suplente en memoria que **no mueve dinero**, para poder ejercer las pantallas sin cuenta del
     * procesador. El real llega cuando haya credenciales; ver `billing/provider.ts` y H-85.
     *
     * Nunca hay suplente por defecto: uno puesto sin querer en producción parecería funcionar.
     */
    PAYMENTS_PROVIDER: z.enum(["none", "local"]).default("none"),

    /**
     * ¿Se exige suscripción vigente en toda operación de negocio?
     *
     * **Llega apagada, y no es un descuido.** La compuerta está implementada y probada; encenderla
     * hoy dejaría fuera a toda empresa que no tenga suscripción — que ahora mismo son todas, porque
     * el trasvase de datos es la rebanada 30. Encendida antes de eso, la aplicación no se puede
     * usar. Ver `HALLAZGOS.md` H-86.
     */
    BILLING_SUBSCRIPTION_GATE: z
      .string()
      .default("false")
      .transform((value) => value === "true" || value === "1"),

    /**
     * Por encima de cuántos asientos se aplica el descuento por volumen, y cuánto.
     *
     * El umbral **no** entra: se aplica por encima. Por debajo, la sesión de pago admite escribir un
     * código promocional a mano; por encima no, para no acumular dos descuentos que nadie autorizó.
     */
    BILLING_VOLUME_SEATS: z.coerce.number().int().positive().default(10),
    BILLING_VOLUME_PERCENT: z
      .string()
      .default("15")
      .refine((value) => /^\d+(\.\d{1,4})?$/.test(value), {
        message: "Porcentaje con cuatro decimales como mucho",
      }),

    /**
     * Cuánto dura el periodo de gracia tras un fallo de cobro.
     *
     * Configurable porque no es una constante del dominio: lo que se está comprando es tiempo para
     * que el cliente arregle su tarjeta, y cuánto vale ese tiempo lo decide el negocio.
     */
    BILLING_GRACE_DAYS: z.coerce.number().int().positive().default(7),
    /** Cada cuánto se barren las suscripciones cuya gracia venció. Por defecto, cada hora. */
    BILLING_GRACE_SWEEP_EVERY_MS: z.coerce.number().int().positive().default(3_600_000),

    /** A dónde vuelve el navegador desde la sesión de pago y desde el formulario del procesador. */
    BILLING_RETURN_ORIGIN: z.string().url().default("http://localhost:3000"),

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

    /**
     * El dominio bajo el que se sirven las tiendas públicas.
     *
     * De él sale la **dirección completa** de un sitio, que es un campo calculado: el identificador
     * legible más este dominio. No se almacena junto al sitio porque no es suyo — es de la
     * instalación, y cambia entre desarrollo, la máquina de alguien y producción. Guardarlo con
     * cada sitio dejaría mil filas apuntando a un dominio que ya no existe el día que se mueva.
     *
     * El valor por defecto es el de desarrollo, donde la aplicación web escucha en el 3000 y
     * cualquier navegador resuelve `loquesea.localhost` sin tocar el sistema de nombres.
     */
    SITES_DOMAIN: z.string().min(1).default("localhost:3000"),

    /**
     * El despachador de trabajos en segundo plano.
     *
     * Se puede apagar —`JOBS_ENABLED=false`— y hace falta que se pueda: con varias instancias del
     * servicio, la cola lo aguanta —el trabajo se toma con bloqueo y salto de lo bloqueado— pero
     * puede convenir que sólo una lo atienda. Apagarlo **no rompe nada**: los trabajos se siguen
     * encolando y esperan a que alguien los atienda.
     */
    JOBS_ENABLED: z
      .string()
      .default("true")
      .transform((value) => value !== "false" && value !== "0"),
    /** Cada cuánto se mira la cola. */
    JOBS_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
    /** A partir de cuándo se da por caído un trabajo que quedó en curso y se devuelve a la cola. */
    JOBS_STUCK_AFTER_MS: z.coerce.number().int().positive().default(300_000),
    /** Espera del primer reintento. Se dobla en cada intento hasta el techo. */
    JOBS_BACKOFF_MS: z.coerce.number().int().positive().default(30_000),
    JOBS_MAX_BACKOFF_MS: z.coerce.number().int().positive().default(3_600_000),

    /**
     * Plazo del recolector de subidas abandonadas.
     *
     * No es una constante del dominio: veinticuatro horas son generosas para una foto y cortas para
     * un video de dos gigas por una conexión mala.
     */
    UPLOADS_ABANDONED_AFTER_HOURS: z.coerce.number().int().positive().default(24),
    UPLOADS_COLLECT_EVERY_MS: z.coerce.number().int().positive().default(3_600_000),
    /**
     * Cuánto cuerpo acepta una petición, en octetos.
     *
     * Un mega ya es enorme para lo que aquí viaja, que es JSON: **los archivos no atraviesan la
     * API** —se suben directamente al almacenamiento con una autorización firmada—, así que ningún
     * endpoint necesita aceptar cargas grandes. Cada ruta puede apretarlo más; ninguna lo afloja.
     */
    BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),

    /**
     * Limitación de frecuencia genérica.
     *
     * Sin valor, se enciende salvo en pruebas. **No es pereza**: el contador vive en memoria y por
     * proceso, así que dejarlo puesto en la suite haría que el resultado de una prueba dependiera
     * de cuántas peticiones hicieron las anteriores en el mismo trabajador. Un fallo así aparece y
     * desaparece según el orden de los archivos, y una suite en la que eso pasa deja de creerse.
     * Las pruebas del limitador lo encienden a mano, con su propio reloj.
     */
    RATE_LIMIT_ENABLED: z.string().optional(),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

    /**
     * Cuánto se recuerda una clave de idempotencia, y cada cuánto se barre lo vencido.
     *
     * No es una constante del dominio: lo que se está comprando es la ventana en la que un
     * reintento todavía reconoce su propia petición. Un día cubre de sobra el reintento de un
     * navegador y el de una integración que se cayó por la noche; recordarlas más tiempo sería
     * guardar cuerpos de respuesta —con sus importes y sus datos personales— sin que nadie los
     * vaya a pedir.
     */
    IDEMPOTENCY_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
    IDEMPOTENCY_SWEEP_EVERY_MS: z.coerce.number().int().positive().default(3_600_000),
    /**
     * A partir de cuándo una clave reclamada y sin terminar se da por abandonada.
     *
     * Es el caso del proceso que se cayó entre reclamar y responder. Se mide en minutos y no en
     * horas a propósito: mientras la clave siga reclamada, su dueño recibe «todavía en curso» y no
     * puede completar la operación. Mismo criterio que `JOBS_STUCK_AFTER_MS`.
     */
    IDEMPOTENCY_ABANDONED_AFTER_MS: z.coerce.number().int().positive().default(300_000),

    /** Cada cuánto se comprueba que las reservas y el inventario digan lo mismo. */
    STOCK_COHERENCE_EVERY_MS: z.coerce.number().int().positive().default(21_600_000),
    NOTIFICATIONS_DELIVER_EVERY_MS: z.coerce.number().int().positive().default(60_000),
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

/**
 * ¿Está encendida la limitación de frecuencia?
 *
 * Sin decisión explícita se enciende, salvo en pruebas. Ver el comentario de `RATE_LIMIT_ENABLED`.
 */
export const rateLimitEnabled =
  env.RATE_LIMIT_ENABLED === undefined
    ? env.NODE_ENV !== "test"
    : env.RATE_LIMIT_ENABLED !== "false" && env.RATE_LIMIT_ENABLED !== "0"

/** El detalle técnico de los errores sólo sale fuera de producción. */
export const exposeErrorDetails = !isProduction
