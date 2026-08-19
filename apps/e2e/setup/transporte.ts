/**
 * La política de transporte de las peticiones que una prueba hace **por fuera del navegador**.
 *
 * ## Por qué existe, y por qué está aquí y no dentro de un recorrido
 *
 * Estaba escrita en `warehouse.ts`, en privado, y se aplicaba sólo a las peticiones de preparación
 * de los recorridos del almacén. Las de los demás archivos —altas por API, y sobre todo las
 * **recogidas**— iban sin nada, y ésa es una de las dos mitades de `HALLAZGOS.md` H-146: la caída de
 * `fotos.spec.ts` era `apiRequestContext.delete: read ECONNRESET`, en la retirada del producto que
 * la propia prueba había creado.
 *
 * El fallo no dice nada de lo que la prueba venía a comprobar —para cuando llega, ya está
 * comprobado— y aun así la tumba entera. Una suite que se cae por eso deja de creerse, que es
 * exactamente lo que H-146 teme.
 *
 * ## Qué reintenta, y qué no
 *
 * `maxRetries` de Playwright reintenta **sólo errores de conexión** —`ECONNRESET`, «socket hang
 * up»—, nunca un código de respuesta. Es la distinción que hace que esto no sea tapar un fallo: si
 * el servicio contesta `500`, se ve; si la conexión se cae antes de que conteste nadie, se vuelve a
 * intentar. Lo que la prueba **afirma** sigue sin reintentarse.
 *
 * Los verbos que atraviesan esto son idempotentes por naturaleza —leer, y borrar lo propio—, así que
 * repetirlos no puede fabricar estado.
 *
 * ## De dónde salen esos reinicios de conexión
 *
 * De dos sitios, y los dos son del entorno y no del producto: la primera ráfaga contra una API
 * recién arrancada, con dieciséis trabajadores compartiendo `127.0.0.1`; y la conexión reutilizada
 * que el servidor cierra por reposo justo mientras el cliente escribe en ella —Node cierra las
 * ociosas a los cinco segundos de fábrica, y una prueba de interfaz se pasa mucho más que eso
 * pulsando botones entre dos llamadas—.
 */

/** Se pasa como parte de las opciones de cualquier petición: `{ ...TRANSPORTE, data }`. */
export const TRANSPORTE = { maxRetries: 3 } as const
