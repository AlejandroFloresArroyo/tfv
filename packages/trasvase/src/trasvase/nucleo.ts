/**
 * El núcleo: cuentas, empresas, membresías, roles, direcciones, contrapartes y taxonomías.
 *
 * Es la primera rutina de dominio y la que fija las políticas que las demás heredan:
 *
 * - **Nada se tira.** Lo que la restricción nueva rechaza va a cuarentena con su regla y su
 *   motivo; lo recuperable se migra degradado con incidencia.
 * - **Los duplicados los resuelve un criterio escrito, no el azar del orden.** El correo repetido
 *   lo gana la cuenta que entró más recientemente; la primaria repetida, la dirección tocada más
 *   recientemente; la membresía repetida, la dueña, luego la activa, luego la más antigua.
 * - **La propiedad se preserva por membresía.** El esquema nuevo no tiene `ownerId`: ser dueño
 *   vive en `company_members.isOwner`. Si el dueño declarado no tiene membresía, se sintetiza una,
 *   con correspondencia propia para que repetir la corrida no la duplique.
 *
 * Todo dentro de una transacción: o migra el núcleo entero o no migra nada.
 */

import {
  companies,
  companyAddresses,
  companyMembers,
  companyServices,
  counterparties,
  type CounterpartySnapshot,
  globalCategories,
  roles,
  services,
  userAddresses,
  users,
} from "@tfv/db/schema"
import type { Documento } from "../volcado/ejson.ts"
import type { Volcado } from "../volcado/leer.ts"
import { type Contexto, enTransaccion, fecha, idDe, marcasDe, recortar, texto } from "./contexto.ts"

export const COLECCIONES_NUCLEO = [
  "core_service",
  "core_user",
  "core_companies",
  "core_categories",
  "core_role",
  "core_companies_user",
  "core_addresses",
  "core_companies_address",
  "core_client",
  "core_provider",
  "core_companies_service",
] as const

async function cargar(volcado: Volcado, coleccion: string): Promise<Documento[]> {
  if (!volcado.existe(coleccion)) return []
  const documentos: Documento[] = []
  for await (const doc of volcado.documentos(coleccion)) documentos.push(doc)
  return documentos
}

/** Una referencia que puede soltarse: se resuelve, o queda nula con incidencia. */
function suave(
  contexto: Contexto,
  coleccion: string,
  idViejo: string,
  campo: string,
  destino: string,
  valor: unknown,
): string | null {
  if (typeof valor !== "string" || valor === "") return null
  const nuevo = contexto.registro.resolver(destino, valor)
  if (nuevo) return nuevo
  contexto.registro.incidencia(
    coleccion,
    idViejo,
    campo,
    `Apuntaba a ${destino}/${valor}, que no existe o quedó en cuarentena; la referencia se soltó`,
  )
  return null
}

/** El objeto de permisos viejo → las claves concedidas, con las rutas anidadas puntuadas. */
function clavesConcedidas(permisos: unknown, prefijo = ""): string[] {
  if (Array.isArray(permisos)) {
    return permisos.filter((valor): valor is string => typeof valor === "string")
  }
  if (permisos === null || typeof permisos !== "object") return []
  const claves: string[] = []
  for (const [clave, valor] of Object.entries(permisos)) {
    const ruta = prefijo === "" ? clave : `${prefijo}.${clave}`
    if (valor === true) claves.push(ruta)
    else if (valor !== null && typeof valor === "object") {
      claves.push(...clavesConcedidas(valor, ruta))
    }
  }
  return claves
}

export async function trasvasarNucleo(contexto: Contexto): Promise<void> {
  const { registro, volcado } = contexto
  registro.limpiarCuarentena(COLECCIONES_NUCLEO)

  const documentos = {
    servicios: await cargar(volcado, "core_service"),
    usuarios: await cargar(volcado, "core_user"),
    empresas: await cargar(volcado, "core_companies"),
    categorias: await cargar(volcado, "core_categories"),
    roles: await cargar(volcado, "core_role"),
    membresias: await cargar(volcado, "core_companies_user"),
    direccionesUsuario: await cargar(volcado, "core_addresses"),
    direccionesEmpresa: await cargar(volcado, "core_companies_address"),
    clientes: await cargar(volcado, "core_client"),
    proveedores: await cargar(volcado, "core_provider"),
    habilitaciones: await cargar(volcado, "core_companies_service"),
  }

  await enTransaccion(contexto, async (db) => {
    // ── Servicios ────────────────────────────────────────────────────────────
    {
      const keycodes = new Set<string>()
      for (const doc of documentos.servicios) {
        const idViejo = idDe(doc)
        const keycode = texto(doc.keycode)
        if (keycode === "") {
          registro.cuarentena(
            "core_service",
            idViejo,
            "keycode-ausente",
            "El servicio no trae keycode y la columna destino lo exige único",
            doc,
          )
          continue
        }
        if (keycodes.has(keycode)) {
          registro.cuarentena(
            "core_service",
            idViejo,
            "keycode-duplicado",
            `El keycode «${keycode}» ya lo lleva otro servicio (services_keycode_unique)`,
            doc,
          )
          continue
        }
        keycodes.add(keycode)

        const fila = {
          id: registro.idPara("core_service", idViejo),
          keycode: recortar(contexto, "core_service", idViejo, "keycode", keycode, 64),
          name: recortar(contexto, "core_service", idViejo, "name", texto(doc.name), 120),
          description: texto(doc.description),
          color: texto(doc.color) || null,
          icon: texto(doc.icon) || null,
          imageUploadId: suave(contexto, "core_service", idViejo, "imageId", "core_upload", doc.imageId),
          isDisabled: doc.disabled === true,
          isAdminOnly: doc.admin === true,
          isOnLanding: doc.landing === true,
          ...marcasDe(doc),
        }
        await db.insert(services).values(fila).onConflictDoUpdate({ target: services.id, set: fila })
      }
    }

    // ── Usuarios ─────────────────────────────────────────────────────────────
    {
      // Quién gana cada correo: el último inicio de sesión manda; sin él, la cuenta más antigua.
      const ganadores = new Map<string, { id: string; metrica: number }>()
      for (const doc of documentos.usuarios) {
        const correo = texto(doc.email).trim().toLowerCase()
        if (correo === "") continue
        const entrada = fecha(doc.lastLogin)
        const creado = fecha(doc.createdAt)
        const metrica = entrada ? entrada.getTime() : -(creado?.getTime() ?? 0)
        const actual = ganadores.get(correo)
        if (!actual || metrica > actual.metrica) {
          ganadores.set(correo, { id: idDe(doc), metrica })
        }
      }

      const usuariosVistos = new Set<string>()
      for (const doc of documentos.usuarios) {
        const idViejo = idDe(doc)
        const correo = texto(doc.email).trim().toLowerCase()
        if (correo === "") {
          registro.cuarentena(
            "core_user",
            idViejo,
            "correo-ausente",
            "La cuenta no trae correo y la columna destino es obligatoria",
            doc,
          )
          continue
        }
        if (ganadores.get(correo)?.id !== idViejo) {
          registro.cuarentena(
            "core_user",
            idViejo,
            "correo-duplicado",
            `El correo «${correo}» lo conserva la cuenta con actividad más reciente (users_email_unique)`,
            doc,
          )
          continue
        }

        let alias = texto(doc.username).trim()
        if (alias === "") {
          alias = `${correo.split("@")[0] ?? "cuenta"}-${idViejo.slice(-4)}`
          registro.incidencia(
            "core_user",
            idViejo,
            "username",
            `Sin nombre de usuario en el origen; se derivó «${alias}» del correo`,
          )
        }
        if (usuariosVistos.has(alias)) {
          const sufijado = `${alias}-${idViejo.slice(-4)}`
          registro.incidencia(
            "core_user",
            idViejo,
            "username",
            `«${alias}» ya estaba tomado (users_username_unique); queda «${sufijado}»`,
          )
          alias = sufijado
        }
        usuariosVistos.add(alias)

        const marcas = marcasDe(doc)
        const fila = {
          id: registro.idPara("core_user", idViejo),
          email: recortar(contexto, "core_user", idViejo, "email", correo, 320),
          username: recortar(contexto, "core_user", idViejo, "username", alias, 64),
          name: recortar(contexto, "core_user", idViejo, "name", texto(doc.name), 120),
          lastname: recortar(contexto, "core_user", idViejo, "lastname", texto(doc.lastname), 120),
          dialCode: recortar(contexto, "core_user", idViejo, "dial", texto(doc.dial, "+52"), 8),
          phone: recortar(contexto, "core_user", idViejo, "phone", texto(doc.phone), 32),
          // SUPUESTO (ver DECISIONES.md, credenciales): el hash bcrypt viaja tal cual; la
          // verificación nueva no lo reconoce todavía, pero anularlo destruiría información.
          passwordHash: texto(doc.password) || null,
          avatarUploadId: suave(contexto, "core_user", idViejo, "imageId", "core_upload", doc.imageId),
          // Decisión 2026-08-19: las verificadas sin verificación real (S-15) migran verificadas.
          emailVerifiedAt: doc.valid === true ? marcas.createdAt : null,
          isActive: doc.active !== false,
          isPlatformAdmin: doc.admin === true,
          lastLoginAt: fecha(doc.lastLogin),
          ...marcas,
        }
        await db.insert(users).values(fila).onConflictDoUpdate({ target: users.id, set: fila })
      }
    }

    // ── Empresas ─────────────────────────────────────────────────────────────
    /** Empresa vieja → usuario viejo dueño, para sintetizar la membresía si falta. */
    const dueños = new Map<string, string>()
    for (const doc of documentos.empresas) {
      const idViejo = idDe(doc)
      const nombre = texto(doc.name).trim()
      if (nombre === "") {
        registro.cuarentena(
          "core_companies",
          idViejo,
          "nombre-ausente",
          "La empresa no trae nombre y la columna destino es obligatoria",
          doc,
        )
        continue
      }

      const dueñoViejo = texto(doc.ownerId)
      if (dueñoViejo !== "" && registro.resolver("core_user", dueñoViejo)) {
        dueños.set(idViejo, dueñoViejo)
      } else {
        registro.incidencia(
          "core_companies",
          idViejo,
          "ownerId",
          `El dueño declarado (core_user/${dueñoViejo || "ninguno"}) no existe o quedó en cuarentena; la empresa migra sin membresía de dueño`,
        )
      }

      const comision =
        typeof doc.fee === "number" && Number.isFinite(doc.fee) && doc.fee >= 0
          ? String(doc.fee)
          : "12.5"
      const prioridad =
        typeof doc.priority === "string"
          ? doc.priority
          : typeof doc.priority === "number"
            ? String(doc.priority)
            : "0"

      const fila = {
        id: registro.idPara("core_companies", idViejo),
        legacyId: idViejo,
        name: recortar(contexto, "core_companies", idViejo, "name", nombre, 200),
        description: texto(doc.description),
        email: texto(doc.email) || null,
        logoUploadId: suave(contexto, "core_companies", idViejo, "imageId", "core_upload", doc.imageId),
        commissionRate: comision,
        priority: prioridad,
        ...marcasDe(doc),
      }
      await db.insert(companies).values(fila).onConflictDoUpdate({ target: companies.id, set: fila })
    }

    // ── Taxonomía global ─────────────────────────────────────────────────────
    {
      const porId = new Map(documentos.categorias.map((doc) => [idDe(doc), doc]))
      const slugs = new Set<string>()
      const keynames = new Set<string>()

      // Padres antes que hijas, porque la clave foránea del árbol es real en el destino.
      const ordenadas: Documento[] = []
      const estado = new Map<string, "abierta" | "cerrada">()
      const apilar = (doc: Documento): void => {
        const id = idDe(doc)
        if (estado.get(id) === "cerrada") return
        if (estado.get(id) === "abierta") return // ciclo: se rompe al resolver el padre
        estado.set(id, "abierta")
        const padre = texto(doc.parentId)
        const docPadre = padre === "" ? undefined : porId.get(padre)
        if (docPadre) apilar(docPadre)
        estado.set(id, "cerrada")
        ordenadas.push(doc)
      }
      for (const doc of documentos.categorias) apilar(doc)

      const migradas = new Set<string>()
      for (const doc of ordenadas) {
        const idViejo = idDe(doc)
        const nombre = texto(doc.name).trim()
        if (nombre === "") {
          registro.cuarentena(
            "core_categories",
            idViejo,
            "nombre-ausente",
            "La categoría no trae nombre y la columna destino es obligatoria",
            doc,
          )
          continue
        }

        let slug: string | null = texto(doc.slug) || null
        if (slug !== null) {
          if (slugs.has(slug)) {
            registro.incidencia(
              "core_categories",
              idViejo,
              "slug",
              `El slug «${slug}» ya lo lleva otra categoría (global_categories_slug_unique); éste se soltó`,
            )
            slug = null
          } else {
            slugs.add(slug)
          }
        }
        let keyname: string | null = texto(doc.keyname) || null
        if (keyname !== null) {
          if (keynames.has(keyname)) {
            registro.incidencia(
              "core_categories",
              idViejo,
              "keyname",
              `El keyname «${keyname}» ya lo lleva otra categoría (global_categories_keyname_unique); éste se soltó`,
            )
            keyname = null
          } else {
            keynames.add(keyname)
          }
        }

        const padreViejo = texto(doc.parentId)
        let parentId: string | null = null
        if (padreViejo !== "") {
          if (migradas.has(padreViejo)) {
            parentId = registro.idPara("core_categories", padreViejo)
          } else {
            registro.incidencia(
              "core_categories",
              idViejo,
              "parentId",
              `El padre (core_categories/${padreViejo}) no existe o no migró; la categoría queda como raíz`,
            )
          }
        }

        const fila = {
          id: registro.idPara("core_categories", idViejo),
          parentId,
          serviceId: suave(contexto, "core_categories", idViejo, "serviceId", "core_service", doc.serviceId),
          keyname,
          name: recortar(contexto, "core_categories", idViejo, "name", nombre, 160),
          description: texto(doc.description),
          slug,
          color: texto(doc.color) || null,
          icon: texto(doc.icon) || null,
          imageUploadId: suave(contexto, "core_categories", idViejo, "imageId", "core_upload", doc.imageId),
          ...marcasDe(doc),
        }
        await db
          .insert(globalCategories)
          .values(fila)
          .onConflictDoUpdate({ target: globalCategories.id, set: fila })
        migradas.add(idViejo)
      }
    }

    // ── Roles ────────────────────────────────────────────────────────────────
    for (const doc of documentos.roles) {
      const idViejo = idDe(doc)
      const companyId = registro.resolver("core_companies", texto(doc.companyId))
      if (!companyId) {
        registro.cuarentena(
          "core_role",
          idViejo,
          "empresa-inexistente",
          `La empresa del rol (core_companies/${texto(doc.companyId) || "ninguna"}) no existe o quedó en cuarentena`,
          doc,
        )
        continue
      }
      const fila = {
        id: registro.idPara("core_role", idViejo),
        companyId,
        name: recortar(contexto, "core_role", idViejo, "name", texto(doc.name), 120),
        permissions: clavesConcedidas(doc.permissions),
        ...marcasDe(doc),
      }
      await db.insert(roles).values(fila).onConflictDoUpdate({ target: roles.id, set: fila })
    }

    // ── Membresías ───────────────────────────────────────────────────────────
    {
      interface Candidata {
        readonly doc: Documento
        readonly idViejo: string
        readonly companyId: string
        readonly userId: string
      }
      const porPareja = new Map<string, Candidata[]>()

      for (const doc of documentos.membresias) {
        const idViejo = idDe(doc)
        const companyId = registro.resolver("core_companies", texto(doc.companyId))
        if (!companyId) {
          registro.cuarentena(
            "core_companies_user",
            idViejo,
            "empresa-inexistente",
            `La empresa (core_companies/${texto(doc.companyId) || "ninguna"}) no existe o quedó en cuarentena`,
            doc,
          )
          continue
        }
        const userId = registro.resolver("core_user", texto(doc.userId))
        if (!userId) {
          registro.cuarentena(
            "core_companies_user",
            idViejo,
            "usuario-inexistente",
            `El usuario (core_user/${texto(doc.userId) || "ninguno"}) no existe o quedó en cuarentena`,
            doc,
          )
          continue
        }
        const clave = `${companyId}|${userId}`
        const lista = porPareja.get(clave) ?? []
        lista.push({ doc, idViejo, companyId, userId })
        porPareja.set(clave, lista)
      }

      /** (empresa vieja, usuario viejo) ya cubiertos, para la síntesis del dueño. */
      const parejasMigradas = new Set<string>()
      for (const candidatas of porPareja.values()) {
        // La dueña gana; luego la activa; luego la más antigua.
        const puntaje = (candidata: Candidata): number =>
          (candidata.doc.isOwner === true ? 4 : 0) +
          (candidata.doc.isActive !== false ? 2 : 0) -
          (fecha(candidata.doc.createdAt)?.getTime() ?? 0) / 1e15
        const ordenadas = [...candidatas].sort((a, b) => puntaje(b) - puntaje(a))
        const ganadora = ordenadas[0] as Candidata

        for (const perdedora of ordenadas.slice(1)) {
          registro.cuarentena(
            "core_companies_user",
            perdedora.idViejo,
            "membresia-repetida",
            "La pareja empresa-usuario ya tiene membresía (company_members_unique); se conservó la dueña, la activa o la más antigua",
            perdedora.doc,
          )
        }

        const doc = ganadora.doc
        const fila = {
          id: registro.idPara("core_companies_user", ganadora.idViejo),
          companyId: ganadora.companyId,
          userId: ganadora.userId,
          roleId: suave(
            contexto,
            "core_companies_user",
            ganadora.idViejo,
            "roleId",
            "core_role",
            doc.roleId,
          ),
          isOwner:
            doc.isOwner === true ||
            dueños.get(texto(doc.companyId)) === texto(doc.userId),
          isActive: doc.isActive !== false,
          ...marcasDe(doc),
        }
        await db
          .insert(companyMembers)
          .values(fila)
          .onConflictDoUpdate({ target: companyMembers.id, set: fila })
        parejasMigradas.add(`${texto(doc.companyId)}|${texto(doc.userId)}`)
      }

      // El dueño declarado sin membresía: se sintetiza una, con correspondencia estable.
      for (const [empresaVieja, dueñoViejo] of dueños) {
        if (parejasMigradas.has(`${empresaVieja}|${dueñoViejo}`)) continue
        const companyId = registro.resolver("core_companies", empresaVieja)
        const userId = registro.resolver("core_user", dueñoViejo)
        if (!companyId || !userId) continue
        registro.incidencia(
          "core_companies",
          empresaVieja,
          "ownerId",
          `El dueño (core_user/${dueñoViejo}) no tenía membresía; se sintetizó una de dueño`,
        )
        const fila = {
          id: registro.idPara("trasvase_membresia_dueño", empresaVieja),
          companyId,
          userId,
          roleId: null,
          isOwner: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        await db
          .insert(companyMembers)
          .values(fila)
          .onConflictDoUpdate({ target: companyMembers.id, set: fila })
      }
    }

    // ── Direcciones ──────────────────────────────────────────────────────────
    const libretas: Array<{
      coleccion: "core_addresses" | "core_companies_address"
      documentos: Documento[]
      campoDueño: "userId" | "companyId"
      coleccionDueño: "core_user" | "core_companies"
      reglaDueño: "usuario-inexistente" | "empresa-inexistente"
      tabla: typeof userAddresses | typeof companyAddresses
    }> = [
      {
        coleccion: "core_addresses",
        documentos: documentos.direccionesUsuario,
        campoDueño: "userId",
        coleccionDueño: "core_user",
        reglaDueño: "usuario-inexistente",
        tabla: userAddresses,
      },
      {
        coleccion: "core_companies_address",
        documentos: documentos.direccionesEmpresa,
        campoDueño: "companyId",
        coleccionDueño: "core_companies",
        reglaDueño: "empresa-inexistente",
        tabla: companyAddresses,
      },
    ]

    for (const libreta of libretas) {
      // Quién conserva la primaria: la dirección tocada más recientemente.
      const primarias = new Map<string, { id: string; metrica: number }>()
      for (const doc of libreta.documentos) {
        if (doc.isPrimary !== true) continue
        const dueño = texto(doc[libreta.campoDueño])
        const metrica = fecha(doc.updatedAt)?.getTime() ?? 0
        const actual = primarias.get(dueño)
        if (!actual || metrica > actual.metrica) {
          primarias.set(dueño, { id: idDe(doc), metrica })
        }
      }

      for (const doc of libreta.documentos) {
        const idViejo = idDe(doc)
        const dueñoViejo = texto(doc[libreta.campoDueño])
        const dueño = registro.resolver(libreta.coleccionDueño, dueñoViejo)
        if (!dueño) {
          registro.cuarentena(
            libreta.coleccion,
            idViejo,
            libreta.reglaDueño,
            `El titular (${libreta.coleccionDueño}/${dueñoViejo || "ninguno"}) no existe o quedó en cuarentena`,
            doc,
          )
          continue
        }

        let esPrimaria = doc.isPrimary === true
        if (esPrimaria && primarias.get(dueñoViejo)?.id !== idViejo) {
          esPrimaria = false
          registro.incidencia(
            libreta.coleccion,
            idViejo,
            "isPrimary",
            "Había más de una primaria en la libreta; conservó la primaria la tocada más recientemente",
          )
        }

        const comun = {
          id: registro.idPara(libreta.coleccion, idViejo),
          label: recortar(contexto, libreta.coleccion, idViejo, "name", texto(doc.name), 120),
          street: recortar(contexto, libreta.coleccion, idViejo, "street", texto(doc.street), 200),
          number: recortar(contexto, libreta.coleccion, idViejo, "number", texto(doc.number), 32),
          colony: recortar(contexto, libreta.coleccion, idViejo, "colony", texto(doc.colony), 120),
          city: recortar(contexto, libreta.coleccion, idViejo, "city", texto(doc.city), 120),
          state: recortar(contexto, libreta.coleccion, idViejo, "state", texto(doc.state), 120),
          country: recortar(contexto, libreta.coleccion, idViejo, "country", texto(doc.country), 120),
          countryCode: recortar(
            contexto,
            libreta.coleccion,
            idViejo,
            "countryCode",
            texto(doc.countryCode),
            2,
          ),
          postalCode: recortar(contexto, libreta.coleccion, idViejo, "zipcode", texto(doc.zipcode), 16),
          latitude: typeof doc.latitude === "number" ? doc.latitude.toFixed(7) : null,
          longitude: typeof doc.longitude === "number" ? doc.longitude.toFixed(7) : null,
          isPrimary: esPrimaria,
          ...marcasDe(doc),
        }

        if (libreta.coleccion === "core_addresses") {
          const fila = { ...comun, userId: dueño }
          await db
            .insert(userAddresses)
            .values(fila)
            .onConflictDoUpdate({ target: userAddresses.id, set: fila })
        } else {
          const fila = { ...comun, companyId: dueño }
          await db
            .insert(companyAddresses)
            .values(fila)
            .onConflictDoUpdate({ target: companyAddresses.id, set: fila })
        }
      }
    }

    // ── Contrapartes ─────────────────────────────────────────────────────────
    {
      const parejasUsuario = new Set<string>()
      const parejasEmpresa = new Set<string>()

      const migrarContraparte = async (
        coleccion: "core_client" | "core_provider",
        papel: "client" | "provider",
        doc: Documento,
      ): Promise<void> => {
        const idViejo = idDe(doc)
        const dueñaVieja = texto(doc.companyId)
        const dueña = registro.resolver("core_companies", dueñaVieja)
        if (!dueña) {
          registro.cuarentena(
            coleccion,
            idViejo,
            "empresa-inexistente",
            `La empresa dueña (core_companies/${dueñaVieja || "ninguna"}) no existe o quedó en cuarentena`,
            doc,
          )
          return
        }

        const contraparteEmpresa = suave(
          contexto,
          coleccion,
          idViejo,
          "userCompanyId",
          "core_companies",
          doc.userCompanyId,
        )
        const contraparteUsuario = suave(contexto, coleccion, idViejo, "userId", "core_user", doc.userId)

        if (contraparteEmpresa) {
          const clave = `${dueña}|${papel}|${contraparteEmpresa}`
          if (parejasEmpresa.has(clave)) {
            registro.cuarentena(
              coleccion,
              idViejo,
              "pareja-repetida",
              "La empresa ya tiene esta contraparte (counterparties_company_pair_unique); se conservó la primera",
              doc,
            )
            return
          }
          parejasEmpresa.add(clave)
        } else if (contraparteUsuario) {
          const clave = `${dueña}|${papel}|${contraparteUsuario}`
          if (parejasUsuario.has(clave)) {
            registro.cuarentena(
              coleccion,
              idViejo,
              "pareja-repetida",
              "La empresa ya tiene esta contraparte (counterparties_user_pair_unique); se conservó la primera",
              doc,
            )
            return
          }
          parejasUsuario.add(clave)
        }

        const info = (doc.userInfo ?? {}) as Record<string, unknown>
        const infoEmpresa = (doc.userCompanyInfo ?? {}) as Record<string, unknown>
        const infoDireccion = (doc.userAddressInfo ?? {}) as Record<string, unknown>
        const direccion = [
          texto(infoDireccion.street),
          texto(infoDireccion.number),
          texto(infoDireccion.colony),
          texto(infoDireccion.city),
          texto(infoDireccion.state),
          texto(infoDireccion.zipcode),
          texto(infoDireccion.country),
        ]
          .filter((parte) => parte !== "")
          .join(", ")

        const copia: CounterpartySnapshot = {
          ...(texto(info.name) !== "" && { name: texto(info.name) }),
          ...(texto(info.lastname) !== "" && { lastname: texto(info.lastname) }),
          ...(texto(info.email) !== "" && { email: texto(info.email) }),
          ...(texto(info.phone) !== "" && { phone: texto(info.phone) }),
          ...(texto(infoEmpresa.name) !== "" && { companyName: texto(infoEmpresa.name) }),
          ...(direccion !== "" && { address: direccion }),
        }

        const fila = {
          id: registro.idPara(coleccion, idViejo),
          companyId: dueña,
          role: papel,
          alias: recortar(contexto, coleccion, idViejo, "alias", texto(doc.alias, papel), 160),
          userId: contraparteUsuario,
          counterpartyCompanyId: contraparteEmpresa,
          snapshot: copia,
          imageUploadId: suave(contexto, coleccion, idViejo, "imageId", "core_upload", doc.imageId),
          ...marcasDe(doc),
        }
        await db
          .insert(counterparties)
          .values(fila)
          .onConflictDoUpdate({ target: counterparties.id, set: fila })
      }

      for (const doc of documentos.clientes) await migrarContraparte("core_client", "client", doc)
      for (const doc of documentos.proveedores) {
        await migrarContraparte("core_provider", "provider", doc)
      }
    }

    // ── Habilitaciones ───────────────────────────────────────────────────────
    {
      const parejas = new Set<string>()
      for (const doc of documentos.habilitaciones) {
        const idViejo = idDe(doc)
        const companyId = registro.resolver("core_companies", texto(doc.companyId))
        if (!companyId) {
          registro.cuarentena(
            "core_companies_service",
            idViejo,
            "empresa-inexistente",
            `La empresa (core_companies/${texto(doc.companyId) || "ninguna"}) no existe o quedó en cuarentena`,
            doc,
          )
          continue
        }
        const serviceId = registro.resolver("core_service", texto(doc.serviceId))
        if (!serviceId) {
          // `DEFECTS.md` L-06: borrar un servicio no invocaba su cascada.
          registro.cuarentena(
            "core_companies_service",
            idViejo,
            "servicio-inexistente",
            `El servicio (core_service/${texto(doc.serviceId) || "ninguno"}) no existe o quedó en cuarentena`,
            doc,
          )
          continue
        }
        const clave = `${companyId}|${serviceId}`
        if (parejas.has(clave)) {
          registro.cuarentena(
            "core_companies_service",
            idViejo,
            "habilitacion-repetida",
            "La empresa ya tiene el servicio habilitado (company_services_unique); se conservó la primera",
            doc,
          )
          continue
        }
        parejas.add(clave)

        const fila = {
          id: registro.idPara("core_companies_service", idViejo),
          companyId,
          serviceId,
          ...marcasDe(doc),
        }
        await db
          .insert(companyServices)
          .values(fila)
          .onConflictDoUpdate({ target: companyServices.id, set: fila })
      }
    }
  })
}
