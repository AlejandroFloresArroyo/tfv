/**
 * Lo que hay que pedirle a la herramienta del proveedor, y por qué eso.
 *
 * Estas órdenes no se pueden ejercer sin una cuenta de AWS, así que lo que se fija aquí es lo único
 * que sí se puede comprobar sin ella: que **se construyen a partir de la configuración de la
 * aplicación** y no de lo que alguien recuerde teclear, y que las tres afirmaciones que hacen falta
 * —lectura pública, CORS con `PUT`, credencial acotada— están dentro de los documentos que se envían.
 *
 * Una orden mal escrita aquí se ve al leerla; una escrita en un documento de operaciones no se ve
 * hasta que alguien la teclea distinta.
 */

import { describe, expect, it } from "vitest"
import {
  corsRules,
  provisioningCommands,
  publicReadPolicy,
  runCommands,
  writePolicy,
} from "./aws.ts"

const ORIGINS = ["https://app.tfv.mx", "https://www.tfv.mx"]

const argvOf = (commands: readonly { argv: readonly string[] }[], api: string): readonly string[] =>
  commands.find((command) => command.argv[2] === api)?.argv ?? []

describe("dejar puesto un depósito de AWS", () => {
  const commands = provisioningCommands({
    bucket: "tfv-archivos",
    region: "us-west-2",
    origins: ORIGINS,
  })

  it("crea el depósito declarando su región", () => {
    // Sin `LocationConstraint` el depósito se crea en Virginia sea cual sea la región configurada, y
    // las direcciones públicas que compone el proveedor apuntarían a otra máquina.
    expect(argvOf(commands, "create-bucket")).toContain("LocationConstraint=us-west-2")
  })

  it("no la declara en la región de fábrica, que es la única que la rechaza", () => {
    const virginia = provisioningCommands({ bucket: "b", region: "us-east-1", origins: ORIGINS })
    expect(argvOf(virginia, "create-bucket").join(" ")).not.toContain("LocationConstraint")
  })

  it("levanta el bloqueo que impediría la política de lectura pública", () => {
    // Un depósito nuevo llega con `BlockPublicPolicy`, así que aplicar la política de lectura
    // responde «acceso denegado» y el paso siguiente falla sin decir por qué.
    const bloqueo = argvOf(commands, "put-public-access-block").join(" ")
    expect(bloqueo).toContain("BlockPublicPolicy=false")
    // Las ACL siguen bloqueadas: la lectura se concede por política, no objeto a objeto.
    expect(bloqueo).toContain("BlockPublicAcls=true")
  })

  it("concede lectura a cualquiera, y sólo lectura", () => {
    const policy = JSON.parse(publicReadPolicy("tfv-archivos")) as {
      Statement: { Effect: string; Principal: string; Action: string[]; Resource: string }[]
    }

    expect(policy.Statement[0]?.Effect).toBe("Allow")
    expect(policy.Statement[0]?.Principal).toBe("*")
    expect(policy.Statement[0]?.Action).toEqual(["s3:GetObject"])
    expect(policy.Statement[0]?.Resource).toBe("arn:aws:s3:::tfv-archivos/*")
  })

  it("admite `PUT` desde los orígenes de la aplicación, y de ningún otro", () => {
    // Es la mitad que falla en producción y funciona en local: el navegador escribe directo, y un
    // depósito recién creado no responde a ningún origen.
    const rules = JSON.parse(corsRules(ORIGINS)) as {
      CORSRules: { AllowedMethods: string[]; AllowedOrigins: string[] }[]
    }

    expect(rules.CORSRules[0]?.AllowedMethods).toContain("PUT")
    expect(rules.CORSRules[0]?.AllowedOrigins).toEqual(ORIGINS)
    expect(rules.CORSRules[0]?.AllowedOrigins).not.toContain("*")
  })

  it("la credencial de la aplicación escribe objetos y no toca el depósito", () => {
    // La llave que firma vive en el servicio. Que además pudiera reescribir la política del depósito
    // convertiría cualquier filtración en «el almacenamiento entero», que es justo lo que el modelo
    // de subida directa se pasa el día evitando.
    const policy = JSON.parse(writePolicy("tfv-archivos")) as {
      Statement: { Action: string[]; Resource: string | string[] }[]
    }
    const acciones = policy.Statement.flatMap((statement) => statement.Action)

    expect(acciones).toContain("s3:PutObject")
    expect(acciones).toContain("s3:DeleteObject")
    expect(acciones).toContain("s3:ListBucket")
    expect(acciones).not.toContain("s3:PutBucketPolicy")
    expect(acciones).not.toContain("s3:*")
    expect(JSON.stringify(policy)).not.toContain("arn:aws:s3:::*")
  })
})

describe("ejecutar el plan", () => {
  it("dice que falta la herramienta en lugar de fallar con un código de sistema", async () => {
    // El caso normal de esta máquina y de cualquier contenedor de despliegue: `aws` no está. Un
    // `ENOENT` sin más deja a quien lo corre buscando en el sitio equivocado.
    await expect(
      runCommands([{ why: "prueba", argv: ["aws-que-no-existe", "s3", "ls"] }]),
    ).rejects.toThrow(/no está instalada|no se encontró/i)
  })
})
