/**
 * La firma, contra los vectores publicados por AWS.
 *
 * Una firma sólo se puede comprobar de dos maneras: contra un ejemplo cuyo resultado publica quien
 * define el protocolo, o mandándosela a un servidor de verdad. Aquí está la primera; la segunda es
 * `media/storage.test.ts`, que escribe en el almacenamiento con la dirección que sale de aquí.
 *
 * Hacen falta las dos. El vector fija que la **petición canónica** se compone bien —que es donde se
 * equivocan todas las implementaciones— sin depender de que haya un almacenamiento levantado; el
 * servidor fija que el conjunto sirve.
 */

import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  amzDate,
  canonicalRequest,
  encodeRfc3986,
  presignedUrl,
  signingKey,
  UNSIGNED_PAYLOAD,
} from "./s3-signature.ts"

/** Las credenciales del ejemplo de la documentación. No son de nadie. */
const EJEMPLO = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
}

describe("la petición canónica", () => {
  it("coincide con el ejemplo de «GET Object» prefirmado", () => {
    // El resumen que publica AWS para ese ejemplo. Que coincida fija de una vez el orden de los
    // parámetros, su codificación, el salto de línea detrás de las cabeceras y la carga sin
    // resumir: cambiar cualquiera de las cuatro cosas cambia este resumen entero.
    const canonical = canonicalRequest({
      method: "GET",
      pathname: "/test.txt",
      query: [
        ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
        ["X-Amz-Credential", `${EJEMPLO.accessKeyId}/20130524/us-east-1/s3/aws4_request`],
        ["X-Amz-Date", "20130524T000000Z"],
        ["X-Amz-Expires", "86400"],
        ["X-Amz-SignedHeaders", "host"],
      ],
      headers: { host: "examplebucket.s3.amazonaws.com" },
      payloadHash: UNSIGNED_PAYLOAD,
    })

    expect(createHash("sha256").update(canonical).digest("hex")).toBe(
      "3bfa292879f6447bbcda7001decf97f4a54dc650c8942174ae0a9121cf58ad04",
    )
  })
})

describe("la clave de firma", () => {
  it("coincide con la derivación del ejemplo de la documentación", () => {
    // El vector publicado deriva la clave para `iam`, y por eso el servicio entra como argumento:
    // comprobarla contra `s3` sería comparar la función consigo misma. Lo que fija este valor es la
    // cadena de cuatro `HMAC` —el prefijo `AWS4`, el orden día · región · servicio, el terminador—,
    // que es idéntica para cualquier servicio.
    expect(
      signingKey(EJEMPLO.secretAccessKey, "20150830", "us-east-1", "iam").toString("hex"),
    ).toBe("c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9")
  })
})

describe("la codificación", () => {
  it("codifica los siete caracteres que `encodeURIComponent` deja pasar", () => {
    // Se ven poco y se notan mucho: el fallo llega como «la firma no coincide», sin decir cuál.
    expect(encodeRfc3986("!'()*")).toBe("%21%27%28%29%2A")
    expect(encodeRfc3986("a-b_c.d~e")).toBe("a-b_c.d~e")
    expect(encodeRfc3986("con espacio")).toBe("con%20espacio")
  })
})

describe("la marca de tiempo", () => {
  it("va sin guiones ni dos puntos, y el día son sus ocho primeras cifras", () => {
    const { stamp, day } = amzDate(new Date("2026-08-19T06:32:09.827Z"))

    expect(stamp).toBe("20260819T063209Z")
    expect(day).toBe("20260819")
  })
})

describe("la dirección prefirmada", () => {
  const opciones = {
    method: "PUT",
    url: "https://ejemplo.s3.us-east-1.amazonaws.com/empresa/archivo/original.jpg",
    credentials: EJEMPLO,
    expiresInSeconds: 7200,
    now: new Date("2026-08-19T06:32:09.827Z"),
  }

  it("lleva la firma dentro y no la credencial", () => {
    const url = presignedUrl(opciones)

    // Lo que viaja al navegador es una firma de la credencial, nunca la credencial.
    expect(url).not.toContain(EJEMPLO.secretAccessKey)
    expect(url).toContain("X-Amz-Signature=")
    expect(url).toContain("X-Amz-Expires=7200")
    expect(url).toContain("X-Amz-SignedHeaders=host")
  })

  it("firma la clave y el verbo: cambiar cualquiera de los dos cambia la firma", () => {
    // Es la propiedad de la que depende todo el modelo de subida directa. Sin ella, entregar la
    // autorización al navegador sería entregarle el almacenamiento entero.
    const original = presignedUrl(opciones)
    const otroObjeto = presignedUrl({
      ...opciones,
      url: opciones.url.replace("original", "robado"),
    })
    const otroVerbo = presignedUrl({ ...opciones, method: "DELETE" })

    const firma = (url: string) => new URL(url).searchParams.get("X-Amz-Signature")

    expect(firma(otroObjeto)).not.toBe(firma(original))
    expect(firma(otroVerbo)).not.toBe(firma(original))
  })

  it("es determinista para el mismo instante", () => {
    // La dirección de escritura no se persiste, pero un cálculo que dependiera de algo más que sus
    // argumentos haría imposible razonar sobre cuándo caduca lo que se entregó.
    expect(presignedUrl(opciones)).toBe(presignedUrl(opciones))
  })
})
