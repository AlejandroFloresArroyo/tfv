/**
 * La comprobación del hueco de migraciones, ejercida sobre un hueco de verdad.
 *
 * Ver `openspec/HALLAZGOS.md` H-169. Lo que se está comprobando no es que la consulta compile: es
 * que **una base a la que le falta una migración sale en rojo**, que es lo único que este candado
 * tiene que hacer y lo único que no se puede afirmar leyendo el código.
 *
 * Cada caso monta **su propia base de un solo uso** y la retira al terminar. No se toca la base de
 * pruebas compartida: aquí se escribe en `drizzle.__drizzle_migrations`, que es justamente la tabla
 * de la que depende que el resto de la suite se haya montado bien.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { compararMigraciones, informe } from "../verify-migrations.ts"

interface Entrada {
  readonly when: number
  readonly tag: string
}

const declaradas = (
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../drizzle/meta/_journal.json"), "utf8"),
  ) as { entries: Entrada[] }
).entries

/** Las bases creadas por esta suite, para retirarlas pase lo que pase. */
const creadas: string[] = []

function urlDe(nombre: string): string {
  const url = new URL(process.env.DATABASE_URL as string)
  url.pathname = `/${nombre}`
  return url.toString()
}

function admin(): postgres.Sql {
  const url = new URL(process.env.DATABASE_URL as string)
  url.pathname = "/postgres"
  return postgres(url.toString(), { max: 1 })
}

/**
 * Una base con exactamente las migraciones que se le digan anotadas.
 *
 * No se aplican de verdad —esto no comprueba el esquema, comprueba el registro—, así que basta con
 * reproducir la tabla que el motor escribe y las filas que habría dejado.
 */
async function baseCon(marcas: readonly number[], conTabla = true): Promise<string> {
  const nombre = `tfv_verifica_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`
  const root = admin()
  try {
    await root.unsafe(`create database "${nombre}"`)
    creadas.push(nombre)
  } finally {
    await root.end()
  }

  const client = postgres(urlDe(nombre), { max: 1 })
  try {
    if (conTabla) {
      await client.unsafe(`
        create schema drizzle;
        create table drizzle.__drizzle_migrations (
          id serial primary key,
          hash text not null,
          created_at bigint
        );
      `)
      for (const marca of marcas) {
        await client`
          insert into drizzle.__drizzle_migrations (hash, created_at)
          values (${`hash-${marca}`}, ${marca})
        `
      }
    }
  } finally {
    await client.end()
  }

  return nombre
}

afterAll(async () => {
  const root = admin()
  try {
    for (const nombre of creadas) await root.unsafe(`drop database if exists "${nombre}"`)
  } finally {
    await root.end()
  }
})

describe("el hueco de migraciones que db:migrate no vuelve a mirar", () => {
  it("una base al día no tiene nada que decir", async () => {
    const nombre = await baseCon(declaradas.map((entrada) => entrada.when))

    const desfase = await compararMigraciones(urlDe(nombre))

    expect(desfase.faltan).toEqual([])
    expect(desfase.sobran).toEqual([])
    expect(desfase.aplicadas).toBe(declaradas.length)
    expect(informe(desfase)).toContain("Migraciones al día")
  })

  it("**caza la que falta**, y la nombra", async () => {
    // El caso de H-169 exactamente: una del medio, cuya marca es anterior a la última aplicada. El
    // motor la salta y responde que todo está al día, así que sin esto no la ve nadie nunca.
    const hueco = declaradas[Math.floor(declaradas.length / 2)] as Entrada
    const nombre = await baseCon(
      declaradas.filter((entrada) => entrada.when !== hueco.when).map((entrada) => entrada.when),
    )

    const desfase = await compararMigraciones(urlDe(nombre))

    expect(desfase.faltan.map((entrada) => entrada.tag)).toEqual([hueco.tag])
    // El informe tiene que decir **cuál**: «faltan migraciones» sin nombre obliga a ir a buscarlas.
    expect(informe(desfase)).toContain(hueco.tag)
  })

  it("una base sin registro ninguno son todas las que faltan, no un error", async () => {
    // Es la base recién creada a la que nadie migró todavía. La respuesta correcta es la lista
    // entera, no una excepción de «no existe la tabla».
    const nombre = await baseCon([], false)

    const desfase = await compararMigraciones(urlDe(nombre))

    expect(desfase.faltan).toHaveLength(declaradas.length)
    expect(desfase.aplicadas).toBe(0)
  })

  it("avisa de lo que la base tiene de más, sin llamarlo fallo", async () => {
    // Cambiar de rama sin recrear la base deja marcas que este árbol no declara. No es un defecto
    // —y por eso no falla—, pero es lo que explica un esquema que no se parece al código.
    const nombre = await baseCon([...declaradas.map((entrada) => entrada.when), 9_999_999_999_999])

    const desfase = await compararMigraciones(urlDe(nombre))

    expect(desfase.faltan).toEqual([])
    expect(desfase.sobran).toEqual([9_999_999_999_999])
    expect(informe(desfase)).toContain("por delante del código")
  })
})
