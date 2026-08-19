/**
 * La copia de los objetos de un depósito a otro.
 *
 * Ver `openspec/specs/media-storage/spec.md`, requisito «Las direcciones públicas de lectura son
 * estables». Es **la otra mitad** de la mudanza: `rewrite.ts` mueve direcciones y esto mueve bytes.
 * Correr sólo la primera deja mil filas apuntando a un depósito vacío.
 *
 * ## Por qué esto no lo hace Node
 *
 * Porque son gigabytes, y arrastrarlos por aquí es reimplementar mal lo que `aws s3 sync` hace bien:
 * paralelismo, reanudación de lo ya copiado, multiparte para los objetos grandes, reintento con
 * espera creciente y comparación por tamaño y fecha para que la segunda pasada sólo copie lo nuevo.
 * Ninguna de esas cinco es negociable en una mudanza de verdad —se corre una vez en frío y otra en
 * caliente, justo antes del corte— y escribir las cinco costaría más que todo el módulo de archivos.
 *
 * Lo que sí es nuestro es **qué hay que sincronizar y en qué orden**, que es lo que este módulo
 * compone: de dónde a dónde, con qué punto de acceso, y con la escala en disco cuando hace falta.
 *
 * ## La escala en disco no es un capricho
 *
 * `aws s3 sync` toma **un** punto de acceso para las dos orillas, así que una copia entre dos
 * almacenamientos distintos —que es exactamente esta mudanza— no existe como una sola orden. Hay que
 * bajar a disco y subir, con sitio para todo lo que pese el depósito. Descubrirlo a mitad de la
 * madrugada del corte es caro; por eso está escrito aquí y no en la cabeza de nadie.
 *
 * ## Lo que no hay que añadir
 *
 * **Ni `--acl public-read`.** La lectura pública se concede con la política del depósito (ver
 * `aws.ts`); pedirla objeto a objeto falla en todo depósito creado desde 2023, que llegan con las
 * ACL deshabilitadas.
 *
 * **Ni tipos de contenido a mano.** La herramienta los deduce de la extensión, y las claves llevan
 * la suya —`original.jpg`, `thumbnail.jpg`— precisamente porque los objetos se sirven al navegador.
 */

import type { AwsCommand } from "./aws.ts"

export interface TransferEnd {
  readonly bucket: string
  /** Punto de acceso, cuando no es AWS. Puesto sólo en la orilla que sea de un compatible. */
  readonly endpoint?: string | undefined
}

export interface TransferInput {
  readonly from: TransferEnd
  readonly to: TransferEnd
  /** Dónde hace escala cuando las dos orillas no comparten servidor. */
  readonly staging?: string | undefined
}

/** El plan de copia: una orden si las dos orillas comparten servidor, dos si no. */
export function transferCommands(input: TransferInput): readonly AwsCommand[] {
  const { from, to, staging = "./mudanza-de-archivos" } = input
  const sameServer = (from.endpoint ?? "") === (to.endpoint ?? "")

  if (sameServer) {
    return [
      {
        why: "Copia los objetos. Repetirla sólo trae lo que haya cambiado, así que se corre en frío y otra vez en el corte.",
        argv: [
          "aws",
          "s3",
          "sync",
          `s3://${from.bucket}`,
          `s3://${to.bucket}`,
          ...(from.endpoint ? ["--endpoint-url", from.endpoint] : []),
        ],
      },
    ]
  }

  return [
    {
      why:
        `Baja los objetos del depósito de origen. Hace falta sitio en disco para todo lo que pese ` +
        "«" +
        from.bucket +
        "»: la herramienta no sabe sincronizar entre dos puntos de acceso distintos.",
      argv: [
        "aws",
        "s3",
        "sync",
        `s3://${from.bucket}`,
        staging,
        ...(from.endpoint ? ["--endpoint-url", from.endpoint] : []),
      ],
    },
    {
      why: "Sube lo bajado al depósito nuevo, conservando las claves — que es lo que hace que las direcciones reescritas encuentren su objeto.",
      argv: [
        "aws",
        "s3",
        "sync",
        staging,
        `s3://${to.bucket}`,
        ...(to.endpoint ? ["--endpoint-url", to.endpoint] : []),
      ],
    },
  ]
}
