/**
 * ¿Se aplicaron **todas** las migraciones a esta base?
 *
 * ## Por qué existe
 *
 * `migrations.test.ts` vigila el archivo: que las marcas crezcan, que el orden del registro coincida
 * con el de los números, que ninguna entrada se quede sin `.sql` ni al revés. Es el candado de
 * H-145 y sigue haciendo falta.
 *
 * Lo que ese candado **no puede ver** es una base concreta. El motor de migraciones lee una sola vez
 * cuál fue la última aplicada y salta todo lo que no supere su marca; a una base a la que ya se le
 * coló un hueco, `db:migrate` le responde «al día» **para siempre**, sin reintento posible y sin
 * decir nada. `migrations.test.ts` no lo caza y no puede: corre sobre bases replicadas desde cero,
 * donde el hueco no existe por construcción.
 *
 * Así que el único sitio donde este defecto vive es una base de larga vida —la de desarrollo, y
 * mañana la de producción—, que es justo la que nadie inspecciona. Ya pasó: `HALLAZGOS.md` H-169,
 * la base de desarrollo con 27 de 28, y la que faltaba llevaba dentro la clave de idempotencia de
 * la compra en tienda y **tres correcciones de aislamiento**.
 *
 * ## Qué compara, y por qué esa columna
 *
 * El registro del archivo declara un `when` por migración —milisegundos— y el motor escribe ese
 * mismo número en `drizzle.__drizzle_migrations.created_at` al aplicarla. Comparar por `when` y no
 * por el hash es deliberado: el hash cambia si alguien reescribe un `.sql` ya aplicado, que es otro
 * defecto y tiene otra respuesta. Aquí sólo se pregunta una cosa: **¿falta alguna?**
 *
 * Se avisa además de las que están aplicadas y no figuran en el registro. No es un fallo —una rama
 * con migraciones propias deja la base por delante del árbol— pero es exactamente lo que se ve
 * cuando alguien cambia de rama sin recrear la base, y callarlo hace perder la tarde siguiente.
 *
 * ## Dónde corre
 *
 * Encadenada detrás de `db:migrate`, para que el despliegue no pueda arrastrar el defecto en
 * silencio, y como paso propio de la integración continua.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"

interface Entrada {
  readonly idx: number
  readonly when: number
  readonly tag: string
}

/** La tabla en la que el motor anota lo que ya aplicó. */
const REGISTRO_EN_BASE = "drizzle.__drizzle_migrations"

function registroDelArchivo(): Entrada[] {
  const ruta = resolve(import.meta.dirname, "drizzle/meta/_journal.json")
  return (JSON.parse(readFileSync(ruta, "utf8")) as { entries: Entrada[] }).entries
}

export interface Desfase {
  /** Están en el archivo y no en la base: el motor no las va a volver a mirar. */
  readonly faltan: readonly Entrada[]
  /** Están en la base y no en el archivo: la base va por delante del árbol. */
  readonly sobran: readonly number[]
  readonly aplicadas: number
  readonly declaradas: number
}

/**
 * Compara el registro del archivo con el de la base.
 *
 * Exportada aparte del guion para que se pueda ejercer sin lanzar un proceso.
 */
export async function compararMigraciones(url: string): Promise<Desfase> {
  const declaradas = registroDelArchivo()
  const client = postgres(url, { max: 1 })

  try {
    // Antes de consultar hay que saber si la tabla existe: en una base a la que nunca se le aplicó
    // nada, preguntar por ella es un error y no la respuesta «no hay ninguna».
    const [existe] = await client<{ hay: boolean }[]>`
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
      ) as hay
    `

    if (!existe?.hay) {
      return { faltan: declaradas, sobran: [], aplicadas: 0, declaradas: declaradas.length }
    }

    const filas = await client<{ created_at: string | number }[]>`
      select created_at from ${client.unsafe(REGISTRO_EN_BASE)}
    `

    // `created_at` es `bigint`, y el controlador lo entrega como cadena para no perder precisión.
    const aplicadas = new Set(filas.map((fila) => Number(fila.created_at)))
    const declaradasPorMarca = new Set(declaradas.map((entrada) => entrada.when))

    return {
      faltan: declaradas.filter((entrada) => !aplicadas.has(entrada.when)),
      sobran: [...aplicadas].filter((marca) => !declaradasPorMarca.has(marca)).sort(),
      aplicadas: aplicadas.size,
      declaradas: declaradas.length,
    }
  } finally {
    await client.end()
  }
}

/** El informe, tal y como lo lee quien mira el registro de un despliegue. */
export function informe(desfase: Desfase): string {
  const lineas: string[] = []

  if (desfase.sobran.length > 0) {
    lineas.push(
      `Aviso: la base tiene ${desfase.sobran.length} migración(es) que este árbol no declara ` +
        `(${desfase.sobran.join(", ")}). La base va por delante del código: es lo que se ve al ` +
        "cambiar de rama sin recrearla.",
    )
  }

  if (desfase.faltan.length === 0) {
    lineas.push(
      `Migraciones al día: ${desfase.declaradas} declaradas, ${desfase.aplicadas} aplicadas.`,
    )
    return lineas.join("\n")
  }

  lineas.push(
    `Faltan ${desfase.faltan.length} de ${desfase.declaradas} migraciones en esta base, y ` +
      "`db:migrate` **no las va a aplicar**: su marca es anterior a la última aplicada, así que el " +
      "motor las salta y responde que todo está al día.",
    "",
    ...desfase.faltan.map((entrada) => `  · ${entrada.tag} (${entrada.when})`),
    "",
    "Se reparan aplicando cada `.sql` a mano con `psql` y anotándolas en " +
      `${REGISTRO_EN_BASE} con su marca, o recreando la base desde cero si se puede permitir. ` +
      "Ver `openspec/HALLAZGOS.md` H-169.",
  )

  return lineas.join("\n")
}

/**
 * Corre sólo cuando se invoca como guion, no al importarlo.
 *
 * Sin esta guarda, la prueba que ejerce la comparación se llevaría por delante el proceso de vitest
 * en cuanto la base tuviera un hueco — que es justo el caso que la prueba viene a montar.
 */
if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      "Falta DATABASE_URL. Levanta la base local con `pnpm db:up` y copia `.env.example` a `.env`.",
    )
  }

  const desfase = await compararMigraciones(url)
  const texto = informe(desfase)

  if (desfase.faltan.length > 0) {
    console.error(texto)
    process.exit(1)
  }

  // biome-ignore lint/suspicious/noConsole: es la salida del guion, y su único canal.
  console.log(texto)
}
