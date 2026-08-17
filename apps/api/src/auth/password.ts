/**
 * Derivación y verificación de contraseñas.
 *
 * Ver `openspec/specs/user-accounts/spec.md`.
 *
 * Se usa **scrypt**, que viene en la biblioteca estándar y no arrastra una dependencia nativa. Es
 * una función de derivación de clave con factor de trabajo ajustable, que es lo que exige la spec.
 *
 * `argon2id` sería preferible por resistencia a ataques con hardware dedicado, y es el camino de
 * mejora natural. Por eso **el formato lleva versión de algoritmo**: una contraseña derivada con
 * scrypt y otra con argon2 pueden convivir, y `needsRehash` señala cuáles migrar en su próximo
 * inicio de sesión, sin pedirle nada al usuario.
 */

import {
  randomBytes,
  type ScryptOptions,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto"

/**
 * Envoltorio de promesa escrito a mano.
 *
 * `promisify` pierde la sobrecarga que acepta opciones, y sin opciones no se puede subir el límite
 * de memoria que el coste elegido necesita.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error)
      else resolve(derived)
    })
  })
}

/** Coste. Subirlos endurece la derivación y la hace más lenta; se revisan con el hardware. */
const COST = 2 ** 15
const BLOCK_SIZE = 8
const PARALLELIZATION = 1
const KEY_LENGTH = 32
const SALT_LENGTH = 16

/** El coste elegido necesita más memoria que la que scrypt permite por defecto. */
const MAX_MEMORY = 128 * COST * BLOCK_SIZE * 2

const ALGORITHM = "scrypt"

export const MIN_PASSWORD_LENGTH = 12

/**
 * Las contraseñas más usadas, que un atacante prueba primero.
 *
 * No pretende ser exhaustiva: una lista completa vive en un servicio aparte. Ésta cubre lo que
 * aparece en cualquier ataque por diccionario, incluidas las variantes en español que las listas
 * en inglés omiten.
 */
const COMMON_PASSWORDS = new Set([
  "123456789012",
  "contrasena123",
  "contraseña123",
  "password1234",
  "qwertyuiop12",
  "administrador",
  "12345678901234",
  "iloveyou1234",
  "welcome12345",
  "abcd12345678",
  "passwordpassword",
  "123123123123",
  "qwerty123456",
  "mexico123456",
  "futbol123456",
])

export interface PasswordIssue {
  readonly message: string
}

/**
 * Comprueba que una contraseña cumple los requisitos mínimos.
 *
 * Se mide por **longitud**, no por composición: exigir un símbolo y un número produce
 * `Passw0rd!` una y otra vez, que es corta y adivinable. Una frase larga resiste más.
 */
export function validatePassword(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = []

  if (password.length < MIN_PASSWORD_LENGTH) {
    issues.push({
      message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    })
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    issues.push({ message: "Esta contraseña es demasiado común. Elige otra." })
  }

  // Repetir un carácter no aporta resistencia por mucho que alargue la cadena.
  if (/^(.)\1*$/.test(password)) {
    issues.push({ message: "La contraseña no puede ser un solo carácter repetido" })
  }

  return issues
}

/** Deriva la contraseña. El resultado incluye algoritmo, parámetros y sal. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  })

  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$")
}

/**
 * Verifica una contraseña contra su derivación almacenada.
 *
 * La comparación es de tiempo constante: comparar con `===` filtra por cuánto tardó en fallar.
 * Devuelve falso ante un formato irreconocible en lugar de lanzar, para que una fila corrupta no
 * tumbe el inicio de sesión.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored)
  if (!parsed) return false

  const derived = await scrypt(password, parsed.salt, parsed.hash.length, {
    N: parsed.cost,
    r: parsed.blockSize,
    p: parsed.parallelization,
    maxmem: 128 * parsed.cost * parsed.blockSize * 2,
  })

  return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash)
}

/**
 * ¿Se derivó con parámetros más débiles que los actuales?
 *
 * Se comprueba tras un inicio de sesión correcto —el único momento en que se tiene la contraseña en
 * claro— para volver a derivarla con los parámetros de hoy.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parseStored(stored)
  if (!parsed) return true

  return (
    parsed.algorithm !== ALGORITHM ||
    parsed.cost < COST ||
    parsed.blockSize < BLOCK_SIZE ||
    parsed.parallelization < PARALLELIZATION
  )
}

interface ParsedHash {
  readonly algorithm: string
  readonly cost: number
  readonly blockSize: number
  readonly parallelization: number
  readonly salt: Buffer
  readonly hash: Buffer
}

function parseStored(stored: string): ParsedHash | null {
  const parts = stored.split("$")
  if (parts.length !== 6) return null

  const [algorithm, cost, blockSize, parallelization, salt, hash] = parts
  if (!algorithm || !cost || !blockSize || !parallelization || !salt || !hash) return null
  if (algorithm !== ALGORITHM) return null

  const parsedCost = Number(cost)
  const parsedBlockSize = Number(blockSize)
  const parsedParallelization = Number(parallelization)

  if (!Number.isSafeInteger(parsedCost) || parsedCost <= 0) return null
  if (!Number.isSafeInteger(parsedBlockSize) || parsedBlockSize <= 0) return null
  if (!Number.isSafeInteger(parsedParallelization) || parsedParallelization <= 0) return null

  return {
    algorithm,
    cost: parsedCost,
    blockSize: parsedBlockSize,
    parallelization: parsedParallelization,
    salt: Buffer.from(salt, "base64url"),
    hash: Buffer.from(hash, "base64url"),
  }
}
