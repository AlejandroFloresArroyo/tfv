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
     * Qué almacenamiento hay detrás.
     *
     * `supabase` —lo de fábrica— es el que se despliega hoy: su API HTTP, con el punto de firma del
     * proveedor. `s3` habla el protocolo de S3 y sirve para AWS y para cualquier compatible.
     *
     * **Cambiarlo no basta para mudarse.** Las direcciones de lectura están persistidas en la fila
     * de cada archivo, así que un cambio de proveedor exige además reescribirlas; para eso está
     * `scripts/rewrite-media-urls.ts`, y la spec lo pide explícitamente.
     */
    STORAGE_PROVIDER: z.enum(["supabase", "s3"]).default("supabase"),

    /**
     * Punto de acceso S3, cuando el almacenamiento no es AWS.
     *
     * Puesto, el depósito viaja en el camino —`{punto}/{depósito}/{clave}`—, que es la forma que
     * entienden los compatibles. Vacío, se usa la de AWS con el depósito en el nombre de máquina.
     * La pila local expone el suyo en `${STORAGE_URL}/s3`, que es contra lo que está ejercido.
     */
    STORAGE_S3_ENDPOINT: z.string().url().optional(),
    STORAGE_S3_REGION: z.string().min(1).default("us-east-1"),
    /**
     * La credencial que firma. **No sale del servidor**, igual que la del proveedor de hoy: lo que
     * viaja al navegador es una dirección con una firma dentro, acotada a una clave y a un verbo.
     */
    STORAGE_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    /**
     * Raíz de las direcciones públicas de lectura.
     *
     * Se declara porque no se puede deducir: en AWS puede ser el depósito, una distribución de CDN
     * o un dominio propio, y en un compatible casi nunca coincide con el punto de escritura. Sin
     * ella se compone la de AWS.
     */
    STORAGE_S3_PUBLIC_URL: z.string().url().optional(),
    /**
     * Cuánto dura la autorización de escritura. Dos horas, como la del proveedor de hoy.
     *
     * No es una constante: lo que se está comprando es tiempo para subir un archivo por la conexión
     * que haya, y el tope del protocolo son siete días.
     */
    STORAGE_S3_EXPIRES_SECONDS: z.coerce.number().int().positive().max(604_800).default(7_200),

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
    /** Cada cuánto se comprueba que las reservas y el inventario digan lo mismo. */
    STOCK_COHERENCE_EVERY_MS: z.coerce.number().int().positive().default(21_600_000),
    NOTIFICATIONS_DELIVER_EVERY_MS: z.coerce.number().int().positive().default(60_000),

    /**
     * Cuánto tiempo aparta una compra el inventario mientras se paga.
     *
     * No es una constante del dominio: es cuánto está dispuesta la tienda a retirar una cámara del
     * catálogo por alguien que todavía no ha pagado. Media hora es lo que tarda un pago con
     * transferencia y una eternidad en un fin de semana de rodaje.
     *
     * La vigencia de la sesión de pago del procesador se fija a la misma, para que lo apartado y lo
     * cobrable caduquen juntos: con dos plazos distintos, uno de los dos deja de ser cierto.
     */
    CHECKOUT_RESERVATION_MINUTES: z.coerce.number().int().positive().default(30),
    /** Cada cuánto se barren las compras cuya sesión caducó. Por defecto, cada cinco minutos. */
    CHECKOUT_SWEEP_EVERY_MS: z.coerce.number().int().positive().default(300_000),
    /**
     * El origen al que vuelve el comprador desde la sesión de pago.
     *
     * «La sesión de pago SHALL indicar a dónde volver… **dentro del dominio de la propia tienda**».
     * Hoy la aplicación web sirve cada tienda bajo `/s/<identificador>`, así que de aquí sale el
     * origen y el camino lo pone la compra. Cuando las tiendas se sirvan por subdominio propio,
     * éste es el único sitio que cambia.
     */
    STOREFRONT_ORIGIN: z.string().url().default("http://localhost:3000"),
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

    if (
      value.STORAGE_PROVIDER === "s3" &&
      (!value.STORAGE_S3_ACCESS_KEY_ID || !value.STORAGE_S3_SECRET_ACCESS_KEY)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_S3_ACCESS_KEY_ID"],
        message:
          "Con STORAGE_PROVIDER=s3 hacen falta STORAGE_S3_ACCESS_KEY_ID y " +
          "STORAGE_S3_SECRET_ACCESS_KEY: sin ellas no se puede firmar ninguna subida. Se comprueba " +
          "al arrancar y no en la primera foto que alguien intente subir.",
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
