/**
 * La conversación del pedido, en lo que servidor y navegador comparten.
 *
 * Transcrito de `openspec/specs/order-chat/spec.md`. El cursor es lo que sostiene «recuperar lo
 * perdido»: si se pierde un mensaje entre dos lecturas, no lo recupera nadie.
 */

import { describe, expect, it } from "vitest"
import {
  type ChatParticipant,
  canDeleteMessage,
  canEditMessage,
  decodeChatCursor,
  encodeChatCursor,
  MESSAGE_MAX_LENGTH,
  normalizeMessageBody,
  rewindChatCursor,
} from "./order-chat.ts"

const ID = "0197f0e1-2c34-7abc-8def-0123456789ab"

describe("el cursor de la conversación", () => {
  it("va y vuelve sin perder nada", () => {
    const at = new Date("2026-08-18T10:00:00.123Z")
    const decoded = decodeChatCursor(encodeChatCursor({ at, id: ID }))

    expect(decoded?.at.getTime()).toBe(at.getTime())
    expect(decoded?.id).toBe(ID)
  })

  it("ordena como ordena el tiempo", () => {
    const older = encodeChatCursor({ at: new Date(1_000), id: ID })
    const newer = encodeChatCursor({ at: new Date(2_000), id: ID })

    expect(decodeChatCursor(older)?.at.getTime()).toBeLessThan(
      decodeChatCursor(newer)?.at.getTime() as number,
    )
  })

  it("un cursor que no entiende no se adivina", () => {
    // Lo que no se entiende vale nulo, y quien lo recibe lee desde el principio. Inventar un
    // instante haría desaparecer en silencio los mensajes anteriores a él.
    expect(decodeChatCursor("")).toBeNull()
    expect(decodeChatCursor("mañana")).toBeNull()
    expect(decodeChatCursor(`abc.${ID}`)).toBeNull()
    expect(decodeChatCursor("1755511200000")).toBeNull()
    expect(decodeChatCursor("1755511200000.no-es-un-identificador")).toBeNull()
    expect(decodeChatCursor(`-1.${ID}`)).toBeNull()
  })

  it("retrocederlo abre una ventana de solape", () => {
    // El solape es lo que cierra la carrera entre confirmar y leer: una escritura que confirma
    // después de que la lectura tomó su instante quedaría por detrás del cursor para siempre.
    const cursor = encodeChatCursor({ at: new Date("2026-08-18T10:00:00.000Z"), id: ID })
    const rewound = decodeChatCursor(rewindChatCursor(cursor, 2_000))

    expect(rewound?.at.toISOString()).toBe("2026-08-18T09:59:58.000Z")
    // Con el identificador mínimo: el solape ha de recoger la ventana entera, no media.
    expect(rewound?.id).toBe("00000000-0000-0000-0000-000000000000")
  })

  it("retroceder lo que no se entiende devuelve el principio", () => {
    expect(rewindChatCursor("mañana", 2_000)).toBe("")
  })
})

describe("el cuerpo de un mensaje", () => {
  it("se recorta, y lo que sólo es espacio no es mensaje", () => {
    expect(normalizeMessageBody("  hola  ")).toBe("hola")
    expect(normalizeMessageBody("   \n ")).toBe("")
  })

  it("no pasa del máximo declarado", () => {
    expect(normalizeMessageBody("a".repeat(MESSAGE_MAX_LENGTH + 50))).toHaveLength(
      MESSAGE_MAX_LENGTH,
    )
  })
})

describe("qué mensajes son míos", () => {
  const yo: ChatParticipant = { userId: "u-1", side: "provider" }

  it("edito y borro los que escribí", () => {
    // Requisito: «Editar y borrar los mensajes propios».
    const mio = { side: "provider", authorId: "u-1", deletedAt: null } as const
    expect(canEditMessage(mio, yo)).toBe(true)
    expect(canDeleteMessage(mio, yo)).toBe(true)
  })

  it("no toco los de otro, ni los de mi propio lado", () => {
    // Escenario: «No se editan mensajes ajenos». El lado no basta: quien escribe es una persona.
    const ajeno = { side: "client", authorId: "u-2", deletedAt: null } as const
    const companero = { side: "provider", authorId: "u-3", deletedAt: null } as const

    expect(canEditMessage(ajeno, yo)).toBe(false)
    expect(canEditMessage(companero, yo)).toBe(false)
    expect(canDeleteMessage(companero, yo)).toBe(false)
  })

  it("los del sistema no se editan ni se borran", () => {
    // Requisito: «Mensajes del sistema». Son la constancia de un hito del pedido; que alguien
    // pudiera reescribirlos los convertiría en otra cosa.
    const sistema = { side: "system", authorId: "u-1", deletedAt: null } as const

    expect(canEditMessage(sistema, yo)).toBe(false)
    expect(canDeleteMessage(sistema, yo)).toBe(false)
  })

  it("lo ya borrado no se vuelve a tocar", () => {
    const borrado = { side: "provider", authorId: "u-1", deletedAt: new Date() } as const

    expect(canEditMessage(borrado, yo)).toBe(false)
    expect(canDeleteMessage(borrado, yo)).toBe(false)
  })
})
