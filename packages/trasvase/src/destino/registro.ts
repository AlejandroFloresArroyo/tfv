/**
 * El esquema `trasvase` y el registro de la corrida.
 *
 * Tres tablas, en un esquema Postgres aparte del que estas rutinas son dueñas —`packages/db` no se
 * toca—:
 *
 * - **`correspondencia`**: identificador viejo → identificador nuevo, por colección. Es lo que
 *   hace idempotente el trasvase: el mismo documento recibe la misma fila destino en cada corrida,
 *   y es también la tabla que la compatibilidad de URLs consultará el día del corte.
 * - **`cuarentena`**: lo que no pasa las restricciones del esquema nuevo no se tira ni rompe la
 *   corrida; queda aquí con su regla, su motivo legible y el documento entero. Se **limpia y
 *   reconstruye por colección en cada corrida**, así una corrida repetida no acumula duplicados y
 *   una fila corregida en el origen sale de la cuarentena sola.
 * - **`incidencias`**: degradaciones que no impiden migrar la fila —un avatar que apuntaba a una
 *   subida inexistente, un slug duplicado que se soltó—. Mismo ciclo de vida que la cuarentena.
 */

import { newId } from "@tfv/contracts"
import { type SQL, sql as consulta } from "drizzle-orm"
import type { Sql } from "postgres"
import type { Documento } from "../volcado/ejson.ts"

/** Lo mínimo que `guardar` necesita: la base o la transacción de drizzle lo cumplen igual. */
export interface EjecutorSql {
  execute(sentencia: SQL): Promise<unknown>
}

/** Crea el esquema y sus tablas si no existen. Seguro de repetir. */
export async function prepararEsquemaTrasvase(sql: Sql): Promise<void> {
  await sql.unsafe(`
    create schema if not exists trasvase;

    create table if not exists trasvase.correspondencia (
      coleccion text not null,
      id_viejo char(24) not null,
      id_nuevo uuid not null,
      creado_en timestamptz not null default now(),
      primary key (coleccion, id_viejo)
    );

    create table if not exists trasvase.cuarentena (
      id bigint generated always as identity primary key,
      coleccion text not null,
      id_viejo char(24) not null,
      regla text not null,
      motivo text not null,
      documento jsonb not null,
      creado_en timestamptz not null default now()
    );
    create index if not exists cuarentena_coleccion_idx
      on trasvase.cuarentena (coleccion, regla);

    create table if not exists trasvase.incidencias (
      id bigint generated always as identity primary key,
      coleccion text not null,
      id_viejo char(24) not null,
      campo text not null,
      detalle text not null,
      creado_en timestamptz not null default now()
    );
    create index if not exists incidencias_coleccion_idx
      on trasvase.incidencias (coleccion, campo);
  `)
}

interface FilaCuarentena {
  readonly coleccion: string
  readonly idViejo: string
  readonly regla: string
  readonly motivo: string
  readonly documento: Documento
}

interface FilaIncidencia {
  readonly coleccion: string
  readonly idViejo: string
  readonly campo: string
  readonly detalle: string
}

export class Registro {
  private constructor(
    private readonly correspondencia: Map<string, string>,
    private readonly cuarentenados: Set<string>,
  ) {}

  private readonly paresNuevos: Array<{ coleccion: string; idViejo: string; idNuevo: string }> = []
  private readonly cuarentenaNueva: FilaCuarentena[] = []
  private readonly incidenciasNuevas: FilaIncidencia[] = []
  private readonly coleccionesLimpiadas = new Set<string>()

  static async abrir(sql: Sql): Promise<Registro> {
    const pares = await sql<{ coleccion: string; id_viejo: string; id_nuevo: string }[]>`
      select coleccion, id_viejo, id_nuevo from trasvase.correspondencia
    `
    const enCuarentena = await sql<{ coleccion: string; id_viejo: string }[]>`
      select distinct coleccion, id_viejo from trasvase.cuarentena
    `
    return new Registro(
      new Map(pares.map((fila) => [`${fila.coleccion}:${fila.id_viejo}`, fila.id_nuevo])),
      new Set(enCuarentena.map((fila) => `${fila.coleccion}:${fila.id_viejo}`)),
    )
  }

  /** El identificador nuevo del documento, estable entre corridas. Lo acuña si no existe. */
  idPara(coleccion: string, idViejo: string): string {
    const clave = `${coleccion}:${idViejo}`
    const existente = this.correspondencia.get(clave)
    if (existente) return existente

    const idNuevo = newId() as string
    this.correspondencia.set(clave, idNuevo)
    this.paresNuevos.push({ coleccion, idViejo, idNuevo })
    return idNuevo
  }

  idExistente(coleccion: string, idViejo: string): string | undefined {
    return this.correspondencia.get(`${coleccion}:${idViejo}`)
  }

  /**
   * El identificador nuevo de una referencia, sólo si la fila destino existe de verdad:
   * migrada en esta corrida o en una anterior, y no caída en cuarentena.
   */
  resolver(coleccion: string, idViejo: unknown): string | undefined {
    if (typeof idViejo !== "string" || idViejo === "") return undefined
    if (this.enCuarentena(coleccion, idViejo)) return undefined
    return this.idExistente(coleccion, idViejo)
  }

  /** Abre la corrida de una colección: su cuarentena y sus incidencias se reconstruyen. */
  limpiarCuarentena(colecciones: readonly string[]): void {
    for (const coleccion of colecciones) {
      this.coleccionesLimpiadas.add(coleccion)
      for (const clave of this.cuarentenados) {
        if (clave.startsWith(`${coleccion}:`)) this.cuarentenados.delete(clave)
      }
    }
  }

  cuarentena(
    coleccion: string,
    idViejo: string,
    regla: string,
    motivo: string,
    documento: Documento,
  ): void {
    this.cuarentenados.add(`${coleccion}:${idViejo}`)
    this.cuarentenaNueva.push({ coleccion, idViejo, regla, motivo, documento })
  }

  enCuarentena(coleccion: string, idViejo: string): boolean {
    return this.cuarentenados.has(`${coleccion}:${idViejo}`)
  }

  incidencia(coleccion: string, idViejo: string, campo: string, detalle: string): void {
    this.incidenciasNuevas.push({ coleccion, idViejo, campo, detalle })
  }

  /**
   * Persiste lo acumulado. Se llama dentro de la transacción de la rutina, para que la
   * correspondencia y las filas destino se escriban juntas o no se escriba ninguna.
   */
  async guardar(ejecutor: EjecutorSql): Promise<void> {
    for (const coleccion of this.coleccionesLimpiadas) {
      await ejecutor.execute(consulta`delete from trasvase.cuarentena where coleccion = ${coleccion}`)
      await ejecutor.execute(
        consulta`delete from trasvase.incidencias where coleccion = ${coleccion}`,
      )
    }
    this.coleccionesLimpiadas.clear()

    for (const par of this.paresNuevos) {
      await ejecutor.execute(consulta`
        insert into trasvase.correspondencia (coleccion, id_viejo, id_nuevo)
        values (${par.coleccion}, ${par.idViejo}, ${par.idNuevo})
        on conflict (coleccion, id_viejo) do nothing
      `)
    }
    this.paresNuevos.length = 0

    for (const fila of this.cuarentenaNueva) {
      await ejecutor.execute(consulta`
        insert into trasvase.cuarentena (coleccion, id_viejo, regla, motivo, documento)
        values (${fila.coleccion}, ${fila.idViejo}, ${fila.regla}, ${fila.motivo},
                ${JSON.stringify(fila.documento)}::jsonb)
      `)
    }
    this.cuarentenaNueva.length = 0

    for (const fila of this.incidenciasNuevas) {
      await ejecutor.execute(consulta`
        insert into trasvase.incidencias (coleccion, id_viejo, campo, detalle)
        values (${fila.coleccion}, ${fila.idViejo}, ${fila.campo}, ${fila.detalle})
      `)
    }
    this.incidenciasNuevas.length = 0
  }
}
