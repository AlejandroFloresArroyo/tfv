/**
 * Lo que hay que pedirle a la herramienta de AWS, compuesto desde nuestra configuración.
 *
 * Ver `openspec/specs/media-storage/spec.md` y `bucket.ts`. Rebanada 08.
 *
 * ## Por qué esto no es código nuestro
 *
 * Porque dejar puesto un depósito de AWS son cuatro documentos —creación, bloqueo de acceso público,
 * política de lectura y reglas de CORS— y `aws` los envía bien desde 2013. Escribirlos aquí sería
 * firmar XML y JSON contra un servicio del que **no tenemos ninguna instancia contra la que
 * probarlo**: la pila local habla el protocolo de S3 para objetos, pero ignora `?policy` y `?cors` y
 * responde a los dos como si fueran otra creación de depósito. Código que no se puede ejercer, en el
 * camino de dejar puesto el almacenamiento de producción, es la peor clase de código que hay: parece
 * que cierra el hueco y sólo lo tapa.
 *
 * Lo que sí es nuestro, y es lo que este módulo aporta, es **qué** hay que pedir. Las órdenes se
 * componen del depósito, la región y los orígenes que la aplicación ya declara, así que no se pueden
 * teclear distinto de como están configurados, y los tres documentos que deciden si esto funciona
 * están fijados por pruebas. Lo que queda para la persona es revisarlas y ejecutarlas — que ante una
 * política de depósito de producción es exactamente lo que debe quedar para una persona.
 *
 * ## Lo que no está aquí
 *
 * Crear el usuario o el rol al que se adjunta `writePolicy`, porque el nombre lo pone quien
 * administre la cuenta y adivinarlo sería escribir una orden que no se puede ejecutar.
 */

import { spawn } from "node:child_process"

export interface AwsCommand {
  /** Por qué hace falta. Se imprime encima de la orden: un plan sin motivos no se revisa, se copia. */
  readonly why: string
  readonly argv: readonly string[]
}

/**
 * Lectura para cualquiera, y **sólo** lectura.
 *
 * Es la política que sostiene el requisito de direcciones estables: se persisten en la fila del
 * archivo y acaban incrustadas en documentos generados y en enlaces repartidos, así que no pueden ir
 * firmadas — una firma caduca y rompería un documento emitido hace un mes. Lo que no debe verse no
 * se protege con la dirección; se protege no subiéndolo aquí.
 */
export function publicReadPolicy(bucket: string): string {
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "LecturaPublicaDeArchivos",
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: `arn:aws:s3:::${bucket}/*`,
        },
      ],
    },
    null,
    2,
  )
}

/**
 * Quién puede escribir directo desde el navegador.
 *
 * `PUT` es el verbo de la subida directa y `GET`/`HEAD` los de leer desde la propia aplicación.
 * Los orígenes se enumeran: nunca comodín, por lo mismo que `CORS_ORIGINS` no lo admite.
 * `ETag` se expone porque es lo que el navegador puede leer para saber que el objeto quedó escrito.
 */
export function corsRules(origins: readonly string[]): string {
  return JSON.stringify(
    {
      CORSRules: [
        {
          AllowedMethods: ["PUT", "GET", "HEAD"],
          AllowedOrigins: [...origins],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3000,
        },
      ],
    },
    null,
    2,
  )
}

/**
 * La credencial con la que firma el servicio: escribe objetos y no toca el depósito.
 *
 * La llave no sale del servidor, pero acotarla es la otra mitad de esa regla: una que además pudiera
 * reescribir la política del depósito convertiría cualquier filtración en «el almacenamiento
 * entero». Aquí no hay `s3:*` ni `arn:aws:s3:::*` a propósito — lo fija una prueba.
 *
 * `ListBucket` hace falta y no es de más: retirar un archivo es retirar **lo que cuelgue de su
 * prefijo**, y las extensiones de sus cinco objetos no se pueden dar por sabidas (`HALLAZGOS.md`
 * H-71).
 */
export function writePolicy(bucket: string): string {
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "EscrituraDeObjetos",
          Effect: "Allow",
          Action: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
          Resource: `arn:aws:s3:::${bucket}/*`,
        },
        {
          Sid: "ListadoParaRetirarPorPrefijo",
          Effect: "Allow",
          Action: ["s3:ListBucket"],
          Resource: `arn:aws:s3:::${bucket}`,
        },
      ],
    },
    null,
    2,
  )
}

/**
 * Las cuatro órdenes que dejan puesto un depósito de AWS, en el orden en que hay que darlas.
 *
 * El orden no es cosmético: la política de lectura pública se rechaza mientras el bloqueo de acceso
 * público siga puesto, y ese bloqueo llega puesto de fábrica en todo depósito nuevo desde 2023.
 */
export function provisioningCommands(input: {
  readonly bucket: string
  readonly region: string
  readonly origins: readonly string[]
}): readonly AwsCommand[] {
  const { bucket, region, origins } = input

  return [
    {
      why:
        "Crea el depósito en su región. La región viaja declarada porque, sin ella, el depósito se " +
        "crea en Virginia sea cual sea la configurada — y `us-east-1` es la única que la rechaza.",
      argv: [
        "aws",
        "s3api",
        "create-bucket",
        "--bucket",
        bucket,
        "--region",
        region,
        ...(region === "us-east-1"
          ? []
          : ["--create-bucket-configuration", `LocationConstraint=${region}`]),
      ],
    },
    {
      why:
        "Levanta el bloqueo que rechazaría la política de lectura pública. Las ACL siguen " +
        "bloqueadas: la lectura se concede por política, no objeto a objeto.",
      argv: [
        "aws",
        "s3api",
        "put-public-access-block",
        "--bucket",
        bucket,
        "--public-access-block-configuration",
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false",
      ],
    },
    {
      why:
        "Lectura pública de los objetos. Las direcciones se persisten y se reparten, así que no " +
        "pueden ir firmadas: una firmada caduca y rompería un documento emitido hace un mes.",
      argv: [
        "aws",
        "s3api",
        "put-bucket-policy",
        "--bucket",
        bucket,
        "--policy",
        publicReadPolicy(bucket),
      ],
    },
    {
      why:
        "CORS con `PUT` desde el origen de la aplicación. El navegador escribe **directo** contra " +
        "el almacenamiento: sin esto toda subida falla en producción y sigue funcionando en local.",
      argv: [
        "aws",
        "s3api",
        "put-bucket-cors",
        "--bucket",
        bucket,
        "--cors-configuration",
        corsRules(origins),
      ],
    },
  ]
}

/**
 * Ejecuta el plan, orden a orden, y se para en la primera que falle.
 *
 * Pararse importa: si la política de lectura no entró, seguir con CORS deja un depósito que admite
 * escrituras y no sirve lo escrito, que es peor que uno sin tocar porque parece hecho.
 */
export async function runCommands(commands: readonly AwsCommand[]): Promise<void> {
  for (const command of commands) {
    const [binary = "aws", ...args] = command.argv

    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, args, { stdio: "inherit" })

      child.on("error", (error: NodeJS.ErrnoException) => {
        reject(
          error.code === "ENOENT"
            ? new Error(
                `La herramienta «${binary}» no está instalada, y este plan es suyo: mover gigabytes ` +
                  "o firmar una política de depósito desde aquí sería reimplementar mal lo que ella " +
                  "hace bien. Instálala —https://aws.amazon.com/cli/— o ejecuta las órdenes " +
                  "impresas desde una máquina que la tenga.",
              )
            : error,
        )
      })

      child.on("close", (code) => {
        if (code === 0) resolve()
        else reject(new Error(`«${command.argv.join(" ")}» terminó con código ${code}`))
      })
    })
  }
}
