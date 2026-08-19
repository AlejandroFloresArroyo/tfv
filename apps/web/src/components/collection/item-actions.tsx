"use client"

import { Button, Menu, MenuContent, MenuItem, MenuTrigger } from "@tfv/ui"
import { MoreHorizontal } from "lucide-react"
import type { ReactNode } from "react"
import { Fragment, useState } from "react"

export interface ItemAction {
  /** Identifica la acción dentro de la tarjeta. No se muestra. */
  key: string
  label: string
  danger?: boolean
  /** El diálogo que abre, gobernado desde aquí. */
  dialog: (control: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode
}

/**
 * Las acciones de un elemento, en un único punto de acceso.
 *
 * `collection-browsing` lo pide así: agrupadas, no repartidas por la tarjeta. Con tres botones
 * sueltos por fila, una lista de veinticuatro elementos ofrece setenta y dos objetivos y ninguno
 * destaca; con un punto de acceso, la tarjeta se lee y las acciones se piden.
 *
 * **Las no permitidas no se pasan.** Se omiten, no se muestran desactivadas: un botón apagado sin
 * explicación deja a la persona intentándolo y preguntando por qué no funciona.
 *
 * ## Por qué el diálogo no cuelga del elemento de menú
 *
 * Porque al elegir una opción el menú se cierra y **desmonta sus elementos**. Si el diálogo colgara
 * de ahí, se iría con él antes de llegar a abrirse. Los diálogos se pintan al lado y el menú sólo
 * dice cuál abrir.
 */
export function ItemActions({ label, actions }: { label: string; actions: readonly ItemAction[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  if (actions.length === 0) return null

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={label} className="px-2">
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </Button>
        </MenuTrigger>

        <MenuContent align="end">
          {actions.map((action) => (
            <MenuItem
              key={action.key}
              className={action.danger ? "text-tinta-alto" : undefined}
              // El menú devuelve el foco a su disparador al cerrarse. Abrir el diálogo en el mismo
              // giro pone las dos cosas a mover el foco a la vez y gana la devolución: el diálogo
              // se abre y el foco se queda fuera. Se abre en el siguiente, ya cerrado el menú.
              onSelect={() => setTimeout(() => setOpenKey(action.key), 0)}
            >
              {action.label}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>

      {/*
        Con clave, y por algo más que callar el aviso: sin ella React empareja los diálogos por su
        posición, así que una lista de acciones que cambie —porque cambian los permisos o el estado
        del elemento— puede reusar el diálogo de una acción para otra y llevarse dentro lo que se
        estuviera escribiendo.
      */}
      {actions.map((action) => (
        <Fragment key={action.key}>
          {action.dialog({
            open: openKey === action.key,
            onOpenChange: (open) => setOpenKey(open ? action.key : null),
          })}
        </Fragment>
      ))}
    </>
  )
}
