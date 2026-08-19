/**
 * El depósito, dejado puesto y comprobado contra el almacenamiento de verdad.
 *
 * Ver `openspec/specs/media-storage/spec.md`. Estas pruebas **crean depósitos propios** —con nombre
 * de un solo uso— y los retiran al terminar: el compartido lo está mirando alguien, y una prueba
 * que lo recree le borraría las fotos.
 *
 * Lo que se está comprobando no es que el código llame a lo que tiene que llamar, sino las dos
 * propiedades de las que depende que una foto se vea:
 *
 *   1. El depósito sirve **lectura pública**, porque las direcciones se persisten y se reparten.
 *   2. El navegador puede **escribir directo** desde el origen de la aplicación, que es una
 *      pregunta de CORS y sólo se responde con un preflight.
 *
 * Requiere la pila local: `pnpm db:up`.
 */

import { describe, expect, it, onTestFinished } from "vitest"
import { env } from "../env.ts"
import { ensureBucket } from "./bucket.ts"
import type { StorageProvider } from "./provider.ts"
import { createS3Provider } from "./providers/s3.ts"
import { createSupabaseProvider } from "./providers/supabase.ts"

const ORIGIN = "http://localhost:3000"

/** Un nombre que no es de nadie. El depósito compartido no se toca. */
function freshBucket(): string {
  return `tfv-prueba-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

function supabaseProviderFor(bucket: string): StorageProvider {
  return createSupabaseProvider({
    url: env.STORAGE_URL,
    bucket,
    serviceKey: env.STORAGE_SERVICE_KEY,
  })
}

function s3ProviderFor(bucket: string): StorageProvider {
  return createS3Provider({
    bucket,
    region: env.STORAGE_S3_REGION,
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
    endpoint: env.STORAGE_S3_ENDPOINT ?? `${env.STORAGE_URL}/s3`,
    publicUrl: `${env.STORAGE_URL}/object/public/${bucket}`,
    expiresInSeconds: env.STORAGE_S3_EXPIRES_SECONDS,
  })
}

const serviceHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${env.STORAGE_SERVICE_KEY ?? ""}`,
  "Content-Type": "application/json",
})

/** Retira el depósito al acabar la prueba que lo creó. */
function removeWhenDone(bucket: string): void {
  onTestFinished(async () => {
    await fetch(`${env.STORAGE_URL}/bucket/${bucket}/empty`, {
      method: "POST",
      headers: serviceHeaders(),
    })
    await fetch(`${env.STORAGE_URL}/bucket/${bucket}`, {
      method: "DELETE",
      headers: serviceHeaders(),
    })
  })
}

async function describeBucket(bucket: string): Promise<{ public: boolean; limit: number | null }> {
  const response = await fetch(`${env.STORAGE_URL}/bucket/${bucket}`, { headers: serviceHeaders() })
  const body = (await response.json()) as { public?: boolean; file_size_limit?: number | null }
  return { public: body.public === true, limit: body.file_size_limit ?? null }
}

describe("dejar el depósito puesto", () => {
  it("lo crea en una máquina donde no existe, y la segunda vez ve que ya estaba", async () => {
    // Es el hueco que cierra H-136: hasta ahora el depósito existía porque alguien lo creó a mano,
    // así que la primera subida de una instalación nueva fallaba sin que nada dijera por qué.
    const bucket = freshBucket()
    removeWhenDone(bucket)
    const provider = supabaseProviderFor(bucket)

    const primera = await ensureBucket({ provider, origins: [ORIGIN] })
    expect(primera.created).toBe(true)
    expect(primera.publicRead).toBe(true)

    const segunda = await ensureBucket({ provider, origins: [ORIGIN] })
    expect(segunda.created).toBe(false)
    expect(segunda.publicRead).toBe(true)
  })

  it("lo deja de lectura pública, y lo comprueba leyendo sin credencial", async () => {
    // Lectura pública y no firmada: la dirección se persiste en la fila del archivo y acaba
    // incrustada en documentos generados. Una firmada caduca y rompería un documento de hace un mes.
    const bucket = freshBucket()
    removeWhenDone(bucket)

    await ensureBucket({ provider: supabaseProviderFor(bucket), origins: [ORIGIN] })

    expect((await describeBucket(bucket)).public).toBe(true)
  })

  it("repara el depósito que está puesto pero es privado", async () => {
    // Idempotente **y reparadora**, como `ensurePlaceholders`: un depósito creado a mano —o creado
    // por el protocolo de S3, que los crea privados— sirve para escribir y no para leer, y el
    // síntoma es una galería entera de recuadros rotos.
    const bucket = freshBucket()
    removeWhenDone(bucket)

    await fetch(`${env.STORAGE_URL}/bucket`, {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({ id: bucket, name: bucket, public: false }),
    })
    expect((await describeBucket(bucket)).public).toBe(false)

    const report = await ensureBucket({ provider: supabaseProviderFor(bucket), origins: [ORIGIN] })

    expect(report.created).toBe(false)
    expect(report.publicRead).toBe(true)
    expect((await describeBucket(bucket)).public).toBe(true)
  })

  it("comprueba que el navegador puede escribir desde el origen de la aplicación", async () => {
    // Sin CORS las subidas fallan en producción y funcionan en local, que es el peor modo de fallo
    // posible: aquí el almacenamiento responde a cualquier origen, y un depósito de AWS recién
    // creado no responde a ninguno. La única forma de saberlo es preguntarlo como lo pregunta el
    // navegador, con un preflight de `PUT` contra la dirección a la que va a escribir.
    const bucket = freshBucket()
    removeWhenDone(bucket)

    const report = await ensureBucket({ provider: supabaseProviderFor(bucket), origins: [ORIGIN] })

    expect(report.cors).toEqual([ORIGIN])
  })

  it("el tope de tamaño lo hace cumplir el depósito, no la API", async () => {
    // La API valida el tamaño **declarado**, y quien escribe es el navegador con una autorización
    // que no lo ata: declarar un kilobyte y escribir cuatro gigas no lo para nadie más que el
    // depósito. Por eso se declara el límite al crearlo. Ver `HALLAZGOS.md` H-161.
    const bucket = freshBucket()
    removeWhenDone(bucket)
    const provider = supabaseProviderFor(bucket)

    await ensureBucket({ provider, origins: [ORIGIN], maxObjectBytes: 64 })

    expect((await describeBucket(bucket)).limit).toBe(64)

    const authorization = await provider.authorizeWrite(
      "empresa/archivo/original.txt",
      "text/plain",
    )
    const written = await fetch(authorization.url, {
      method: "PUT",
      headers: authorization.headers,
      body: new Uint8Array(4096),
    })

    expect(written.ok).toBe(false)
  })

  it("se planta ante un depósito que no sirve lectura pública", async () => {
    // El protocolo de S3 crea el depósito y no dice nada de su política de lectura: en AWS eso es
    // una política de depósito y se pone con la herramienta del proveedor. La comprobación tiene que
    // **fallar** aquí, porque un informe que dijera «listo» sobre un depósito privado es
    // exactamente el fallo que esto existe para no tener.
    const bucket = freshBucket()
    removeWhenDone(bucket)

    await expect(
      ensureBucket({ provider: s3ProviderFor(bucket), origins: [ORIGIN] }),
    ).rejects.toThrow(/lectura pública/i)
  })

  it("el depósito configurado ya está puesto, y volver a asegurarlo no lo cambia", async () => {
    // Sobre el depósito de verdad, el compartido: la operación es idempotente, así que correrla en
    // cada despliegue —que es lo que se pide de ella— no puede tocar nada.
    const report = await ensureBucket({ origins: [ORIGIN] })

    expect(report.bucket).toBe(env.STORAGE_BUCKET)
    expect(report.created).toBe(false)
    expect(report.publicRead).toBe(true)
    expect(report.cors).toEqual([ORIGIN])
  })
})
