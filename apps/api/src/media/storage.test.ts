/**
 * El contrato del proveedor de almacenamiento, ejercido contra el almacenamiento de verdad.
 *
 * Ver `openspec/specs/media-storage/spec.md`. Esta prueba **no conoce ningún proveedor**: recorre
 * los que haya y les exige lo mismo a todos. Es lo que convierte «cambiar de proveedor es una
 * variable de entorno» en algo comprobado y no en una intención.
 *
 * Las cuatro propiedades que se piden son las de la spec, no las de una implementación:
 *
 *   1. La autorización escribe **su** objeto sin credencial ninguna.
 *   2. Y no alcanza a ningún otro. Si esto falla, entregar la autorización al navegador es
 *      entregarle el almacenamiento entero.
 *   3. La dirección pública de lectura es estable y sirve lo que se escribió.
 *   4. Retirar un prefijo se lleva **todos** sus objetos, no sólo el que alguien recuerde.
 *
 * Requiere la pila local: `pnpm db:up`.
 */

import { describe, expect, it } from "vitest"
import { env } from "../env.ts"
import type { StorageProvider } from "./provider.ts"
import { createS3Provider } from "./providers/s3.ts"
import { storageProvider } from "./storage.ts"

const BYTES = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1])

/** Un prefijo propio por ejecución: estas pruebas comparten depósito con las demás. */
function freshPrefix(): string {
  return `pruebas/contrato-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

/**
 * El proveedor de S3, apuntando a **la pila local**.
 *
 * No hace falta cuenta de AWS: la pila que ya se levanta con `pnpm db:up` expone su punto S3, y
 * ejercerlo contra él comprueba lo mismo —la firma, el acotamiento, el listado y el borrado— con un
 * servidor de verdad al otro lado. Ejercerlo contra un doble comprobaría nuestra idea de S3.
 *
 * Se construye aquí y no se pone como proveedor del servicio: lo que se despliega sigue siendo el
 * de siempre, y esta prueba no cambia eso.
 */
function s3Provider(): StorageProvider {
  if (!env.STORAGE_S3_ACCESS_KEY_ID || !env.STORAGE_S3_SECRET_ACCESS_KEY) {
    throw new Error(
      "Faltan STORAGE_S3_ACCESS_KEY_ID y STORAGE_S3_SECRET_ACCESS_KEY en `.env`. Las imprime " +
        "`pnpm db:status` como S3_PROTOCOL_ACCESS_KEY_ID y S3_PROTOCOL_ACCESS_KEY_SECRET. Sin " +
        "ellas el segundo proveedor no se puede ejercer, y una prueba que se saltara sería una " +
        "prueba que dice que sí sin haber mirado.",
    )
  }

  return createS3Provider({
    bucket: env.STORAGE_BUCKET,
    region: env.STORAGE_S3_REGION,
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
    endpoint: env.STORAGE_S3_ENDPOINT ?? `${env.STORAGE_URL}/s3`,
    publicUrl:
      env.STORAGE_S3_PUBLIC_URL ?? `${env.STORAGE_URL}/object/public/${env.STORAGE_BUCKET}`,
    expiresInSeconds: env.STORAGE_S3_EXPIRES_SECONDS,
  })
}

/**
 * Los dos, con la misma vara.
 *
 * Que la lista tenga dos elementos y no uno es lo que hace que «cambiar de proveedor es una
 * variable de entorno» sea una afirmación comprobada.
 */
const providers = [storageProvider(), s3Provider()]

describe.each(providers.map((provider) => [provider.name, provider] as const))(
  "el proveedor «%s»",
  (_name, provider) => {
    it("autoriza a escribir su objeto, y la escritura no lleva credencial de la API", async () => {
      const path = `${freshPrefix()}/original.txt`
      const authorization = await provider.authorizeWrite(path, "text/plain")

      expect(authorization.method).toBe("PUT")
      expect(Date.parse(authorization.expiresAt)).toBeGreaterThan(Date.now())

      const written = await fetch(authorization.url, {
        method: authorization.method,
        headers: authorization.headers,
        body: BYTES,
      })

      expect(written.ok).toBe(true)

      await provider.removeObjects([path.slice(0, path.lastIndexOf("/"))])
    })

    it("esa autorización no alcanza a otro objeto", async () => {
      const prefix = freshPrefix()
      const authorization = await provider.authorizeWrite(`${prefix}/original.txt`, "text/plain")

      const ajeno = authorization.url.replace("original.txt", "robado.txt")
      const written = await fetch(ajeno, {
        method: "PUT",
        headers: authorization.headers,
        body: BYTES,
      })

      expect(written.ok).toBe(false)
      // Y no quedó escrito: que responda mal sin haber escrito es lo que se está comprobando.
      expect((await fetch(provider.publicUrl(`${prefix}/robado.txt`))).ok).toBe(false)
    })

    it("la dirección pública es estable y sirve lo escrito", async () => {
      // Escenario: «La dirección no cambia entre lecturas». Están incrustadas en documentos
      // generados y en enlaces repartidos, así que calcularlas dos veces tiene que dar lo mismo.
      const prefix = freshPrefix()
      const path = `${prefix}/original.txt`

      expect(provider.publicUrl(path)).toBe(provider.publicUrl(path))

      const authorization = await provider.authorizeWrite(path, "text/plain")
      await fetch(authorization.url, {
        method: authorization.method,
        headers: authorization.headers,
        body: BYTES,
      })

      const read = await fetch(provider.publicUrl(path))
      expect(read.ok).toBe(true)
      expect(new Uint8Array(await read.arrayBuffer())).toEqual(BYTES)

      await provider.removeObjects([prefix])
    })

    it("retirar el prefijo se lleva los cinco objetos", async () => {
      // El defecto que esto vigila es H-71: el registro desaparecía y sus cinco objetos se
      // quedaban. Las extensiones **no se pueden dar por sabidas**, así que retirar tiene que
      // preguntar qué hay y no deducirlo.
      const prefix = freshPrefix()
      const variants = ["original.jpg", "thumbnail.jpg", "small.png", "medium.webp", "large.jpg"]

      for (const variant of variants) {
        const authorization = await provider.authorizeWrite(
          `${prefix}/${variant}`,
          "application/octet-stream",
        )
        const written = await fetch(authorization.url, {
          method: authorization.method,
          headers: authorization.headers,
          body: BYTES,
        })
        expect(written.ok).toBe(true)
      }

      for (const variant of variants) {
        expect((await fetch(provider.publicUrl(`${prefix}/${variant}`))).ok).toBe(true)
      }

      await provider.removeObjects([prefix])

      for (const variant of variants) {
        expect((await fetch(provider.publicUrl(`${prefix}/${variant}`))).ok).toBe(false)
      }
    })

    it("retirar lo que no está no falla", async () => {
      // Es el caso normal del recolector: una subida que se interrumpió antes de escribir deja
      // registro y ningún objeto.
      await expect(provider.removeObjects([freshPrefix()])).resolves.toBeUndefined()
      await expect(provider.removeObjects([])).resolves.toBeUndefined()
    })
  },
)

describe("qué proveedor está puesto", () => {
  it("por omisión sigue siendo el de siempre", async () => {
    // Lo que se despliega hoy no cambia porque exista una costura. Cambiar de proveedor es poner
    // una variable, y mientras nadie la ponga esto tiene que seguir siendo lo de antes.
    expect(storageProvider().name).toBe("supabase")
  })
})
