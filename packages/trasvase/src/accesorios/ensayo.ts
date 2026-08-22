/**
 * El volcado de ensayo: un origen pequeño con los defectos del origen real representados.
 *
 * Cada defecto cita su fila en `DEFECTS.md` o el mecanismo del árbol viejo que lo produce. Sirve a
 * las dos mitades del paquete: el comprobador debe **encontrarlos**, y las rutinas de trasvase
 * deben **sobrevivirlos** —migrar lo sano, poner en cuarentena lo que la restricción nueva
 * rechaza, y degradar con incidencia lo recuperable—.
 */

import type { Documento } from "../volcado/ejson.ts"
import {
  categoria,
  cliente,
  decimal,
  direccionEmpresa,
  direccionUsuario,
  empresa,
  habilitacion,
  membresia,
  meta,
  oid,
  pagoSuscripcion,
  plan,
  proveedor,
  reiniciarOids,
  rol,
  servicio,
  subida,
  suscripcion,
  usuario,
} from "./construir.ts"

/** El tipo se infiere del literal: cada identificador con nombre sale como `string`, no opcional. */
export type Ensayo = ReturnType<typeof ensayo>

export function ensayo() {
  reiniciarOids()

  // ─── Archivos sanos ────────────────────────────────────────────────────────
  const metaAvatar = meta()
  const metaLogo = meta({ fileName: "logo.png", name: "logo" })
  const subidaAvatar = subida({ metaId: metaAvatar._id })
  const subidaLogo = subida({ metaId: metaLogo._id })
  // `DEFECTS.md` O-05: las subidas interrumpidas se quedan pendientes para siempre, sin meta.
  const subidaPendiente = subida({ status: "pending", metaId: undefined, quality: undefined })
  // Meta borrada o nunca escrita: la referencia queda rota y el archivo existe.
  const subidaSinMeta = subida({ metaId: oid() })

  // ─── Usuarios ──────────────────────────────────────────────────────────────
  const ana = usuario({
    username: "ana_torres",
    name: "Ana",
    lastname: "Torres",
    email: "ana@ejemplo.mx",
    imageId: subidaAvatar._id,
    lastLogin: new Date("2026-08-01T09:00:00.000Z"),
  })
  const benito = usuario({
    username: "benito_r",
    name: "Benito",
    email: "benito@ejemplo.mx",
    imageId: subidaAvatar._id,
  })
  const carla = usuario({
    username: "carla_compradora",
    name: "Carla",
    email: "carla@ejemplo.mx",
    imageId: subidaAvatar._id,
    // La única cuenta con verificación honesta a la vista: nunca entró al panel.
    valid: false,
  })
  // Restricción nueva `users_email_unique`: el origen dejó entrar el mismo correo dos veces.
  const duplicadoViejo = usuario({
    username: "doble_uno",
    email: "doble@ejemplo.mx",
    imageId: subidaAvatar._id,
  })
  const duplicadoNuevo = usuario({
    username: "doble_dos",
    email: "doble@ejemplo.mx",
    imageId: subidaAvatar._id,
    lastLogin: new Date("2026-08-10T12:00:00.000Z"),
  })
  // Documento anterior al esquema: sin correo. La columna nueva es `not null`.
  const sinCorreo = usuario({ username: "sin_correo", imageId: subidaAvatar._id })
  delete (sinCorreo as Record<string, unknown>).email

  // ─── Empresas ──────────────────────────────────────────────────────────────
  const filmadora = empresa({
    name: "Filmadora del Valle",
    description: "Casa productora",
    imageId: subidaLogo._id,
    ownerId: ana._id,
    fee: 12.5,
    priority: decimal("1.5"),
  })
  // El usuario dueño se borró sin cascada: la referencia requerida quedó rota.
  const sinDueño = empresa({ name: "Sin Dueño SA", imageId: subidaLogo._id, ownerId: oid() })

  // ─── Roles y membresías ────────────────────────────────────────────────────
  const rolVentas = rol({
    name: "Ventas",
    companyId: filmadora._id,
    permissions: {
      "warehouses.quotes.read": true,
      "warehouses.quotes.write": true,
      "warehouses.stock.write": false,
    },
  })
  // Cascada incompleta al borrar una empresa: el rol quedó huérfano.
  const rolHuerfano = rol({ name: "De nadie", companyId: oid() })

  const membresiaAna = membresia({ companyId: filmadora._id, userId: ana._id, isOwner: true })
  const membresiaBenito = membresia({
    companyId: filmadora._id,
    userId: benito._id,
    roleId: rolVentas._id,
  })
  // El origen no tenía restricción única (empresa, usuario): el doble clic creaba dos.
  const membresiaRepetida = membresia({
    companyId: filmadora._id,
    userId: benito._id,
    roleId: rolVentas._id,
  })
  // Usuario borrado sin cascada: la membresía quedó colgando de nadie.
  const membresiaRota = membresia({ companyId: filmadora._id, userId: oid() })

  // ─── Direcciones ───────────────────────────────────────────────────────────
  const dirAna = direccionUsuario({
    userId: ana._id,
    isPrimary: true,
    name: "Casa",
    street: "Reforma",
    number: "222",
    city: "CDMX",
    state: "Ciudad de México",
    country: "México",
    countryCode: "MX",
    zipcode: "06600",
  })
  const dirAnaSecundaria = direccionUsuario({ userId: ana._id, name: "Oficina" })
  // El origen no imponía «una primaria por libreta»; el índice parcial nuevo sí.
  const dirBenitoPrimera = direccionUsuario({ userId: benito._id, isPrimary: true, name: "Casa" })
  const dirBenitoSegunda = direccionUsuario({ userId: benito._id, isPrimary: true, name: "Bodega" })
  // Usuario borrado sin cascada.
  const dirHuerfana = direccionUsuario({ userId: oid() })

  const dirFilmadora = direccionEmpresa({
    companyId: filmadora._id,
    isPrimary: true,
    name: "Estudio",
    city: "CDMX",
    zipcode: "03100",
  })

  // ─── Servicios, habilitaciones y taxonomía ─────────────────────────────────
  const servicioAlmacenes = servicio({
    name: "Almacenes",
    keycode: "warehouses",
    imageId: subidaLogo._id,
  })
  const habilitacionFilmadora = habilitacion({
    companyId: filmadora._id,
    serviceId: servicioAlmacenes._id,
  })
  // `DEFECTS.md` L-06: borrar un servicio no invocaba su cascada; la habilitación quedó colgando.
  const habilitacionRota = habilitacion({ companyId: filmadora._id, serviceId: oid() })

  const catSectores = categoria({ name: "Sectores", slug: "sectores" })
  const catCine = categoria({
    name: "Cine",
    slug: "cine",
    parentId: catSectores._id,
    serviceId: servicioAlmacenes._id,
    keyname: "cine",
  })
  // `GenerateSlug` más borrados a medias dejaron el mismo slug dos veces.
  const catSlugRepetido = categoria({ name: "Ciné", slug: "cine" })
  // El padre se borró y `childsIds` de otro documento aún lo nombra: subárbol descolgado.
  const catPadreRoto = categoria({ name: "Descolgada", slug: "descolgada", parentId: oid() })

  // ─── Contrapartes ──────────────────────────────────────────────────────────
  const clienteCarla = cliente({
    alias: "Carla",
    companyId: filmadora._id,
    userId: carla._id,
    userInfo: { name: "Carla", lastname: "López", email: "carla@ejemplo.mx", phone: "5511122233" },
    imageId: subidaAvatar._id,
  })
  // El aprovisionamiento corría dos veces y creaba la pareja repetida; la restricción parcial
  // nueva (`counterparties_user_pair_unique`) rechaza la segunda.
  const clienteRepetido = cliente({
    alias: "Carla otra vez",
    companyId: filmadora._id,
    userId: carla._id,
  })
  const proveedorExterno = proveedor({
    alias: "Luz y Sonido",
    companyId: filmadora._id,
    userInfo: { name: "Luz", email: "contacto@luzysonido.mx" },
    userCompanyInfo: { name: "Luz y Sonido SA" },
    userAddressInfo: { street: "Insurgentes", number: "500", city: "CDMX" },
  })

  // ─── Suscripciones y facturación ───────────────────────────────────────────
  const planPro = plan({
    tier: 1,
    title: "Pro",
    productId: "prod_pro",
    features: [
      {
        _id: oid(),
        key: "seats",
        name: "Asientos",
        description: "",
        hasValue: true,
        hasSubFeatures: false,
        value: "10",
        type: "number",
        limited: true,
      },
    ],
  })
  const suscripcionFilmadora = suscripcion({
    companyId: filmadora._id,
    userId: ana._id,
    subscriptionId: planPro._id,
    quantity: 3,
    stripe_subscriptionId: "sub_filmadora",
  })
  // Dos vigentes de la misma empresa: el índice parcial nuevo admite una sola no cancelada.
  const suscripcionDoble = suscripcion({
    companyId: filmadora._id,
    userId: ana._id,
    subscriptionId: planPro._id,
    stripe_subscriptionId: "sub_doble",
  })

  // La empresa apunta a su suscripción vigente, como en el origen real: es el desempate honesto
  // cuando hay dos vigentes y el índice parcial nuevo sólo admite una.
  filmadora.companySubscriptionId = suscripcionFilmadora._id

  const pagoJunio = pagoSuscripcion({
    companyId: filmadora._id,
    companySubscriptionId: suscripcionFilmadora._id,
    stripe_invoiceId: "in_junio",
    amount: 49900,
    periodStart: new Date("2026-06-01T00:00:00.000Z"),
    periodEnd: new Date("2026-07-01T00:00:00.000Z"),
  })
  const pagoJulio = pagoSuscripcion({
    companyId: filmadora._id,
    companySubscriptionId: suscripcionFilmadora._id,
    stripe_invoiceId: "in_julio",
    amount: 49900,
  })
  const pagoFallido = pagoSuscripcion({
    companyId: filmadora._id,
    companySubscriptionId: suscripcionFilmadora._id,
    stripe_invoiceId: "in_fallido",
    amount: 49900,
    status: "failed",
  })
  // `DEFECTS.md` M-08: un pago fallido eliminaba la suscripción entera; sus cobros quedaron
  // apuntando a un documento que ya no existe.
  const pagoColgado = pagoSuscripcion({
    companyId: filmadora._id,
    companySubscriptionId: oid(),
    stripe_invoiceId: "in_colgado",
    amount: 19900,
  })

  const colecciones: Record<string, Documento[]> = {
    core_user: [ana, benito, carla, duplicadoViejo, duplicadoNuevo, sinCorreo],
    core_companies: [filmadora, sinDueño],
    core_companies_user: [membresiaAna, membresiaBenito, membresiaRepetida, membresiaRota],
    core_role: [rolVentas, rolHuerfano],
    core_addresses: [dirAna, dirAnaSecundaria, dirBenitoPrimera, dirBenitoSegunda, dirHuerfana],
    core_companies_address: [dirFilmadora],
    core_client: [clienteCarla, clienteRepetido],
    core_provider: [proveedorExterno],
    core_categories: [catSectores, catCine, catSlugRepetido, catPadreRoto],
    core_service: [servicioAlmacenes],
    core_companies_service: [habilitacionFilmadora, habilitacionRota],
    core_upload: [subidaAvatar, subidaLogo, subidaPendiente, subidaSinMeta],
    core_meta: [metaAvatar, metaLogo],
    core_subscription: [planPro],
    core_companies_subscription: [suscripcionFilmadora, suscripcionDoble],
    core_companies_subscriptions_payment: [pagoJunio, pagoJulio, pagoFallido, pagoColgado],
  }

  return {
    colecciones,
    ids: {
      ana: ana._id as string,
      benito: benito._id as string,
      carla: carla._id as string,
      duplicadoViejo: duplicadoViejo._id as string,
      duplicadoNuevo: duplicadoNuevo._id as string,
      sinCorreo: sinCorreo._id as string,
      filmadora: filmadora._id as string,
      sinDueño: sinDueño._id as string,
      rolVentas: rolVentas._id as string,
      rolHuerfano: rolHuerfano._id as string,
      membresiaAna: membresiaAna._id as string,
      membresiaBenito: membresiaBenito._id as string,
      membresiaRepetida: membresiaRepetida._id as string,
      membresiaRota: membresiaRota._id as string,
      dirAna: dirAna._id as string,
      dirBenitoPrimera: dirBenitoPrimera._id as string,
      dirBenitoSegunda: dirBenitoSegunda._id as string,
      dirHuerfana: dirHuerfana._id as string,
      dirFilmadora: dirFilmadora._id as string,
      servicioAlmacenes: servicioAlmacenes._id as string,
      habilitacionFilmadora: habilitacionFilmadora._id as string,
      habilitacionRota: habilitacionRota._id as string,
      catSectores: catSectores._id as string,
      catCine: catCine._id as string,
      catSlugRepetido: catSlugRepetido._id as string,
      catPadreRoto: catPadreRoto._id as string,
      clienteCarla: clienteCarla._id as string,
      clienteRepetido: clienteRepetido._id as string,
      proveedorExterno: proveedorExterno._id as string,
      subidaAvatar: subidaAvatar._id as string,
      subidaLogo: subidaLogo._id as string,
      subidaPendiente: subidaPendiente._id as string,
      subidaSinMeta: subidaSinMeta._id as string,
      planPro: planPro._id as string,
      suscripcionFilmadora: suscripcionFilmadora._id as string,
      suscripcionDoble: suscripcionDoble._id as string,
      pagoJunio: pagoJunio._id as string,
      pagoJulio: pagoJulio._id as string,
      pagoFallido: pagoFallido._id as string,
      pagoColgado: pagoColgado._id as string,
    },
  }
}
