/**
 * `@tfv/trasvase`: el trasvase de la pila anterior (MongoDB) a la nueva (Postgres).
 *
 * Dirigido por volcado: todo lee de un directorio de exportación de `mongoexport`, nunca de una
 * conexión viva. Ver `DISEÑO.md` para la arquitectura y `DECISIONES.md` para las decisiones de
 * negocio propuestas.
 */

export { comprobarVolcado, informeAnalisis, type Analisis } from "./analisis/comprobar.ts"
export { prepararEsquemaTrasvase, Registro } from "./destino/registro.ts"
export { COLECCIONES, NOMBRES_CONOCIDOS } from "./modelo/colecciones.ts"
export { trasvasarArchivos } from "./trasvase/archivos.ts"
export { abrirContexto, type Contexto } from "./trasvase/contexto.ts"
export { correrTrasvase, DOMINIOS } from "./trasvase/correr.ts"
export { trasvasarFacturacion } from "./trasvase/facturacion.ts"
export { trasvasarNucleo } from "./trasvase/nucleo.ts"
export {
  cuadrarImportes,
  informeCuarentena,
  muestrear,
  verificarRecuentos,
} from "./verificacion/verificar.ts"
export { abrirVolcado, type Documento, type Volcado } from "./volcado/leer.ts"
