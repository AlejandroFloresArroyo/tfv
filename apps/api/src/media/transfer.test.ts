/**
 * El plan de copia, que es lo único de la mudanza de bytes que es nuestro.
 *
 * Los bytes los mueve `aws s3 sync` —ver la cabecera de `transfer.ts`—, así que aquí no se comprueba
 * que se copien: se comprueba **qué se le pide**, que es donde se equivoca uno. Y sobre todo la
 * forma que no es obvia: entre dos almacenamientos distintos la copia no es una orden, son dos.
 */

import { describe, expect, it } from "vitest"
import { transferCommands } from "./transfer.ts"

describe("copiar los objetos de un depósito a otro", () => {
  it("entre dos depósitos del mismo servidor es una sola orden", () => {
    const commands = transferCommands({ from: { bucket: "viejo" }, to: { bucket: "nuevo" } })

    expect(commands).toHaveLength(1)
    expect(commands[0]?.argv).toEqual(["aws", "s3", "sync", "s3://viejo", "s3://nuevo"])
  })

  it("entre servidores distintos son dos, con una escala en disco", () => {
    // `aws s3 sync` toma **un** punto de acceso para las dos orillas, así que una copia entre dos
    // almacenamientos distintos no existe como una sola orden: hay que bajar y subir. Descubrirlo
    // con dos terabytes a medias es caro; por eso está escrito aquí y no en la cabeza de nadie.
    // Ver `HALLAZGOS.md` H-162.
    const commands = transferCommands({
      from: { bucket: "viejo", endpoint: "http://127.0.0.1:54321/storage/v1/s3" },
      to: { bucket: "nuevo" },
      staging: "/var/tmp/mudanza",
    })

    expect(commands).toHaveLength(2)
    expect(commands[0]?.argv).toEqual([
      "aws",
      "s3",
      "sync",
      "s3://viejo",
      "/var/tmp/mudanza",
      "--endpoint-url",
      "http://127.0.0.1:54321/storage/v1/s3",
    ])
    expect(commands[1]?.argv).toEqual(["aws", "s3", "sync", "/var/tmp/mudanza", "s3://nuevo"])
  })
})
