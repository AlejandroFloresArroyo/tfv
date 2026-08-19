/**
 * Lo que el servicio necesita de un almacenamiento de objetos.
 *
 * Ver `openspec/specs/media-storage/spec.md`.
 *
 * Son **tres operaciones en el camino de datos y ninguna más**, y esa cortedad es el punto: mientras
 * el resto del sistema sólo sepa pedir permiso, componer una dirección y retirar objetos, cambiar de
 * proveedor es escribir otra implementación de esta interfaz. Lo que la hace posible es que los
 * bytes no pasan por aquí — el modelo de subida directa no deja al servicio en medio del camino de
 * datos, así que no hay flujos, ni cargas parciales, ni reanudación que portar.
 *
 * La cuarta, `ensureBucket`, no está en ese camino: corre **una vez, al montar**, y existe porque
 * las otras tres dan por hecho un depósito que hasta ahora no creaba nadie (`HALLAZGOS.md` H-136).
 * Se pone aquí y no en un guion aparte porque lo que hay que dejar puesto depende del proveedor
 * —quien tiene el depósito sabe cómo se crea— y porque lo que **no** depende de él es la
 * comprobación de que sirve, que es la misma para todos y vive en `bucket.ts`. Los dos proveedores
 * la tienen ejercida en `bucket.test.ts`, contra depósitos de un solo uso.
 *
 * ## La regla que ninguna implementación puede romper
 *
 * **La credencial de servicio no sale del servidor.** Lo que viaja al navegador es una autorización
 * acotada a un objeto y con caducidad. Un proveedor que no sepa emitir eso no vale, por muy bien
 * que haga las otras dos: entregar la llave al navegador es entregar el almacenamiento entero, y
 * ninguna comodidad lo compensa.
 *
 * Las cinco propiedades que se le exigen están escritas como prueba en `storage.test.ts`, y esa
 * prueba **no conoce a ningún proveedor**: recorre los que haya.
 */

export interface BucketSetup {
  readonly bucket: string
  /** Si lo creó esta llamada. Falso significa que ya estaba, no que fallara. */
  readonly created: boolean
  /**
   * Qué quedó declarado, en una línea por cosa.
   *
   * Es la salida del guion que se corre al desplegar, y lo único que distingue «no hizo falta» de
   * «este proveedor no sabe hacerlo». La diferencia importa: en el almacenamiento de hoy la lectura
   * pública es una propiedad del depósito y se declara aquí; en S3 es una **política del depósito**
   * y se pone con la herramienta del proveedor, así que esta operación crea y calla — y quien
   * comprueba que sirve es `bucket.ts`, leyendo un objeto sin credencial.
   */
  readonly notes: readonly string[]
}

export interface WriteAuthorization {
  /** Dirección absoluta a la que escribir. Lleva el permiso dentro. */
  readonly url: string
  readonly method: "PUT"
  readonly headers: Readonly<Record<string, string>>
  readonly expiresAt: string
}

export interface StorageProvider {
  /** Cómo se llama en `STORAGE_PROVIDER`. Sale en los mensajes y en la prueba de contrato. */
  readonly name: string

  /**
   * Deja el depósito puesto, con lo que este proveedor sepa declarar de él.
   *
   * **Idempotente y reparadora**, como `ensurePlaceholders` y por lo mismo: se corre en cada
   * despliegue, así que encontrarlo puesto no es un error, y encontrarlo mal puesto —privado, sin
   * tope de tamaño— tiene que arreglarlo en vez de callarse.
   *
   * El tope se recibe y no se decide aquí: la API valida el tamaño **declarado** en la solicitud, y
   * quien escribe es el navegador con una autorización que no lo ata. El único sitio donde ese
   * límite se hace cumplir de verdad es el depósito (`HALLAZGOS.md` H-161).
   */
  ensureBucket(options: { readonly maxObjectBytes: number }): Promise<BucketSetup>

  /**
   * Autoriza a escribir **ese** objeto y ninguno más.
   *
   * La autorización caduca, y `expiresAt` dice cuándo según el almacenamiento: el cliente reintenta
   * en función de eso, y una vigencia inventada aquí le haría descubrirlo a mitad de una subida.
   *
   * Tiene que permitir **sobrescribir la misma clave**. El reintento por objeto vuelve a pedir
   * autorización para el archivo entero —no sabe pedir cuatro de cinco—, así que un proveedor que
   * se niegue ante una clave ya escrita cierra el reintento justo cuando algo salió bien (H-132).
   */
  authorizeWrite(path: string, contentType: string): Promise<WriteAuthorization>

  /**
   * Dirección pública de lectura de un objeto ya escrito.
   *
   * **Estable**: se persiste en la fila del archivo y acaba incrustada en documentos generados y en
   * enlaces repartidos. Cambiarla es un cambio de datos, no de configuración; por eso existe
   * `scripts/rewrite-media-urls.ts`.
   */
  publicUrl(path: string): string

  /**
   * Retira del almacenamiento todo lo que cuelga de esos prefijos.
   *
   * **Por prefijo, no por clave**, y esa distinción cuesta un defecto de los caros: un archivo son
   * cinco objetos cuyas extensiones no se pueden dar por sabidas —el original conserva la suya y
   * los derivados llevan la del formato que el navegador supo escribir—, y de una subida
   * interrumpida puede haber cualquier subconjunto. Deducir la lista borra de menos y deja basura
   * que ya nadie reclama (`HALLAZGOS.md` H-71).
   *
   * No falla cuando no hay nada: es el caso normal del recolector de subidas abandonadas.
   */
  removeObjects(prefixes: readonly string[]): Promise<void>
}
