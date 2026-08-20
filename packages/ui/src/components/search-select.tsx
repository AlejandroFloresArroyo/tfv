"use client"

import { Check, ChevronDown, Search, X } from "lucide-react"
import { Popover } from "radix-ui"
import type { KeyboardEvent } from "react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { cn } from "../lib/cn.ts"
import { filterOptions, type SelectOption } from "../lib/search-select.ts"
import { Spinner } from "./spinner.tsx"

/**
 * Selector con búsqueda.
 *
 * Existe porque hay cuatro sitios en el flujo del almacén donde la lista es demasiado larga para un
 * desplegable: cliente, responsable, ubicación y categoría. Un `<select>` con trescientos clientes
 * es una lista que sólo se puede recorrer.
 *
 * Dos cosas que lo separan de un desplegable con una caja de texto encima:
 *
 * - **Sigue el patrón de caja combinada**: la búsqueda es el `combobox`, la lista es un `listbox`,
 *   y la opción activa se anuncia con `aria-activedescendant` sin que el foco salga de la caja.
 *   Movido con flechas y elegido con `Intro`, sin ratón.
 * - **El filtrado puede ser de aquí o del servidor.** Sin `onSearch` filtra la lista que recibe;
 *   con él, se calla y enseña lo que le den. Trescientos clientes se filtran aquí; treinta mil
 *   productos, no.
 */

export interface SearchSelectProps {
  value: string | null
  onValueChange: (value: string | null) => void
  options: readonly SelectOption[]
  /** Lo que se ve sin selección. */
  placeholder: string
  searchPlaceholder: string
  /** Cuando la búsqueda no encuentra nada. */
  emptyLabel: string
  /** Etiqueta del aspa que quita la selección. Ausente, no se puede quitar. */
  clearLabel?: string | undefined
  /** Presente, el filtrado es del servidor y este componente no filtra nada. */
  onSearch?: ((query: string) => void) | undefined
  loading?: boolean | undefined
  /** Anuncia la espera a quien no ve la ruedecita. Obligatorio en la práctica si hay `loading`. */
  loadingLabel?: string | undefined
  disabled?: boolean | undefined
  id?: string | undefined
  "aria-describedby"?: string | undefined
  "aria-invalid"?: boolean | undefined
  required?: boolean | undefined
  className?: string | undefined
}

export function SearchSelect({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  clearLabel,
  onSearch,
  loading = false,
  loadingLabel,
  disabled = false,
  id,
  className,
  ...aria
}: SearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listId = useId()
  const optionId = useId()
  const search = useRef<HTMLInputElement>(null)

  const shown = useMemo(
    () => (onSearch ? options : filterOptions(options, query)),
    [onSearch, options, query],
  )

  const selected = options.find((option) => option.value === value)

  // La opción activa vuelve al principio en cuanto cambia la lista: dejarla en el índice cuatro de
  // una lista que ahora tiene dos deja la caja anunciando una opción que no existe.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la dependencia es el disparador, no una lectura.
  useEffect(() => setActive(0), [shown])

  function choose(option: SelectOption | undefined) {
    if (option === undefined) return
    onValueChange(option.value)
    setOpen(false)
    setQuery("")
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((index) => Math.min(Math.max(index + step, 0), Math.max(shown.length - 1, 0)))
      return
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      setActive(event.key === "Home" ? 0 : shown.length - 1)
      return
    }

    if (event.key === "Enter") {
      // Sin esto, `Intro` sobre la búsqueda envía el formulario que hay debajo.
      event.preventDefault()
      choose(shown[active])
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <div className={cn("flex", className)}>
        <Popover.Trigger
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          {...aria}
          className={cn(
            "flex h-[var(--control-h)] flex-1 items-center gap-2 rounded-lg border border-edge-control bg-panel px-3",
            "text-left text-body1 transition-colors duration-200 ease-[--ease-out-soft]",
            "hover:border-content-faint",
            "aria-invalid:border-[var(--luz-alto)]",
            "disabled:cursor-not-allowed disabled:opacity-60",
            selected ? "text-content" : "text-content-faint",
            clearLabel !== undefined && selected ? "rounded-r-none border-r-0" : "",
          )}
        >
          <span className="flex-1 truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-content-faint" aria-hidden="true" />
        </Popover.Trigger>

        {clearLabel !== undefined && selected ? (
          <button
            type="button"
            onClick={() => onValueChange(null)}
            disabled={disabled}
            aria-label={clearLabel}
            className={cn(
              "inline-flex h-[var(--control-h)] items-center rounded-r-lg border border-edge-control bg-panel px-3",
              "text-content-muted transition-colors duration-200 ease-[--ease-out-soft]",
              "hover:bg-panel-hover hover:text-content",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            search.current?.focus()
          }}
          className={cn(
            "z-(--z-dialog) w-(--radix-popover-trigger-width) min-w-60 overflow-hidden rounded-xl",
            "border border-edge bg-panel-raised",
            "shadow-[0_12px_32px_-8px_rgb(0_0_0/0.28)] dark:shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)]",
            "data-[state=open]:enter-fade",
          )}
        >
          <div className="flex items-center gap-2 border-edge border-b px-3">
            <Search className="size-4 shrink-0 text-content-faint" aria-hidden="true" />
            <input
              ref={search}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                onSearch?.(event.target.value)
              }}
              onKeyDown={navigate}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={shown[active] ? `${optionId}-${active}` : undefined}
              className="h-10 w-full bg-transparent text-body1 text-content outline-none placeholder:text-content-faint"
            />
            {loading ? (
              <Spinner
                className="text-content-faint"
                {...(loadingLabel === undefined ? {} : { label: loadingLabel })}
              />
            ) : null}
          </div>

          {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: es la lista de un
              combobox, y el papel es el que su patrón exige. Quitarlo deja la caja sin lista que
              anunciar. */}
          <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {shown.length === 0 ? (
              <li className="px-3 py-4 text-center text-body2 text-content-faint">{emptyLabel}</li>
            ) : (
              shown.map((option, index) => (
                <li key={option.value}>
                  <button
                    type="button"
                    id={`${optionId}-${index}`}
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => choose(option)}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left",
                      index === active ? "bg-panel-hover" : "",
                    )}
                  >
                    <span className="flex-1 truncate">
                      <span className="block text-body2 text-content">{option.label}</span>
                      {option.hint ? (
                        <span className="block text-body3 text-content-faint">{option.hint}</span>
                      ) : null}
                    </span>

                    {option.value === value ? (
                      <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
