/**
 * Lo que la pantalla de facturación lee de la API.
 *
 * Aparte de la página porque lo comparten el servidor y el cliente, y `page.tsx` no puede llegar al
 * navegador.
 */

export interface ProfileBusiness {
  readonly type: "individual" | "company" | "government_entity" | "non_profit"
  readonly legalName: string
  readonly taxId: string
  readonly taxRegime?: string
  readonly invoiceUse?: string
  readonly email?: string
}

export interface ProfileBank {
  readonly bankName?: string
  readonly holderType: "individual" | "company"
  readonly holder: string
  /** Los dieciocho dígitos. La pantalla la enseña enmascarada. */
  readonly clabe: string
  readonly currency: "MXN" | "USD"
  readonly country: string
}

export interface ProfileRow {
  readonly id: string
  readonly alias: string
  readonly business: ProfileBusiness
  readonly bank: ProfileBank
  readonly status: "pending" | "limited" | "active" | "inactive"
  readonly verificationStatus: "pending" | "verified" | "disabled"
  readonly canAcceptCharges: boolean
  readonly canReceivePayouts: boolean
  readonly isPrimary: boolean
  readonly termsAcceptedAt: string | null
  readonly createdAt: string
}

export interface OperatingProfile {
  readonly exists: boolean
  readonly canCharge: boolean
  readonly status: string | null
  readonly verificationStatus: string | null
}

/**
 * La cuenta bancaria, enseñando sólo los cuatro últimos dígitos.
 *
 * Sirve para reconocer cuál es sin ponerla entera en pantalla: identificarla es lo que hace falta
 * aquí, y los otros catorce dígitos sólo añaden algo que alguien puede leer por encima del hombro.
 */
export function maskClabe(clabe: string): string {
  return clabe.length <= 4 ? clabe : `•••• ${clabe.slice(-4)}`
}
