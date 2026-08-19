"use client"

import {
  AmountInput,
  Badge,
  Button,
  Callout,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Panel,
  Rail,
  RailKey,
  Select,
  Separator,
  Spinner,
  Switch,
  Textarea,
} from "@tfv/ui"
import { useState } from "react"

/**
 * Referencia del sistema de diseño.
 *
 * **Andamio, no producto.** Existe para poder mirar el mundo visual completo sin levantar la base
 * de datos ni la API, y para tomar capturas en los cuatro tamaños y los dos temas. No consume
 * ningún dato y no está traducida: los textos van literales en español porque nombran piezas del
 * sistema, no interfaz de usuario final. Se borra con el directorio cuando el rediseño se cierre.
 *
 * El contenido es vocabulario real del glosario —unidad, medida, apartado, pedido de almacén— y no
 * relleno: un sistema de diseño mirado con texto falso miente sobre lo que aguanta.
 */

const ESCALERA = [
  { tone: "reposo", nombre: "Borrador", nota: "Nada comprometido todavía" },
  { tone: "curso", nombre: "En revisión", nota: "El cliente la está viendo" },
  { tone: "aparta", nombre: "Apartado", nota: "Unidades físicas comprometidas" },
  { tone: "cuida", nombre: "Por vencer", nota: "La ventana de fechas se cierra en 2 días" },
  { tone: "firme", nombre: "Entregado", nota: "Firmado pieza por pieza", filled: true },
  { tone: "alto", nombre: "Rechazado", nota: "El cliente declinó", filled: true },
  { tone: "leido", nombre: "Extraído", nota: "El modelo lo sacó del guion, falta revisar" },
] as const

const LINEAS = [
  {
    medida: "ARRI SkyPanel S60-C",
    codigo: "SKY-60C-0114",
    dias: 5,
    tarifa: "1,850.00",
    estado: "aparta",
    nombre: "Apartado",
  },
  {
    medida: "Cooke S4/i 32mm T2.0",
    codigo: "CKE-S4-0032",
    dias: 5,
    tarifa: "2,400.00",
    estado: "aparta",
    nombre: "Apartado",
  },
  {
    medida: "Tripié O'Connor 2575D",
    codigo: "OCN-2575-0007",
    dias: 5,
    tarifa: "980.00",
    estado: "curso",
    nombre: "Sin apartar",
  },
  {
    medida: "Cable 4/0 · 50 pies",
    codigo: "CBL-40-0231",
    dias: 3,
    tarifa: "160.00",
    estado: "reposo",
    nombre: "Borrador",
  },
] as const

/**
 * Los títulos van solos, sin número ni antetítulo.
 *
 * Numerar las secciones sólo se gana cuando el orden es información que alguien necesita —los pasos
 * de un asistente, los pliegues de una secuencia—. Aquí no lo es: es decoración con aspecto de
 * sistema, y de las que se cuelan sin que nadie las decida.
 */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rule-t px-4 py-8 tablet:px-6 laptop:px-10">
      <h2 className="mb-5 text-h3 font-bold text-content">{titulo}</h2>
      {children}
    </section>
  )
}

export default function SistemaPage() {
  const [clave, setClave] = useState("cotizacion")
  const [importe, setImporte] = useState("1850.00")
  const [tema, setTema] = useState("es")
  const [envio, setEnvio] = useState(false)

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[120rem] bg-canvas text-content">
      {/* ─── Cabecera ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-4 py-6 tablet:px-6 laptop:px-10">
        <div>
          <h1 className="text-h1 font-bold tracking-tight">Motor de Rayado</h1>
          <p className="mt-1 max-w-[65ch] text-body2 text-content-muted">
            El sistema de diseño de TFV. Los filetes miden un píxel de dispositivo, no uno de CSS;
            no hay una sola esquina redondeada; y el estado es una marca trazada que siempre viaja
            con su nombre.
          </p>
        </div>
        <span className="apparatus text-content-faint">seed 9f316c9f</span>
      </header>

      {/* ─── El raíl, que es la pieza de composición del mundo ─────────────── */}
      <div className="rule-t flex flex-col laptop:flex-row">
        <Rail>
          <RailKey active={clave === "cotizacion"} onClick={() => setClave("cotizacion")}>
            Cotización
          </RailKey>
          <RailKey active={clave === "fechas"} onClick={() => setClave("fechas")}>
            Fechas
          </RailKey>
          <RailKey active={clave === "impuestos"} onClick={() => setClave("impuestos")}>
            Impuestos
          </RailKey>
          <RailKey active={clave === "contactos"} onClick={() => setClave("contactos")}>
            Contactos
          </RailKey>
        </Rail>

        <div className="min-w-0 flex-1 px-4 py-6 tablet:px-6 laptop:px-10">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-h3 font-bold">Cotización</h2>
              <span className="font-mono text-body3 text-content-muted tnum">COT-2026-00418</span>
            </div>
            <Badge tone="aparta">Apartado</Badge>
          </div>

          {/* Teléfono: cada línea en bloque, con su etiqueta al lado del valor. Desplazar en
              horizontal escondería la tarifa y el estado, que son lo único que se viene a ver. */}
          <ul className="rule bg-panel tablet:hidden">
            {LINEAS.map((linea) => (
              <li key={linea.codigo} className="flex flex-col gap-1.5 px-3 py-3 not-last:rule-b">
                <span className="text-body2 font-semibold text-content">{linea.medida}</span>
                <span className="font-mono text-body3 text-content-muted tnum">{linea.codigo}</span>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="apparatus text-content-faint">{linea.dias} días</span>
                  <span className="font-mono text-body2 tnum">{linea.tarifa}</span>
                </div>
                <Badge tone={linea.estado}>{linea.nombre}</Badge>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto tablet:block">
            <table className="w-full border-collapse text-body2">
              <thead>
                <tr className="rule-b text-left">
                  <th className="py-2 pr-4 apparatus text-content-faint">Medida</th>
                  <th className="py-2 pr-4 apparatus text-content-faint">Código</th>
                  <th className="py-2 pr-4 text-right apparatus text-content-faint">Días</th>
                  <th className="py-2 pr-4 text-right apparatus text-content-faint">Tarifa</th>
                  <th className="py-2 apparatus text-content-faint">Reserva</th>
                </tr>
              </thead>
              <tbody>
                {LINEAS.map((linea) => (
                  <tr key={linea.codigo} className="rule-b">
                    <td className="py-2.5 pr-4 text-content">{linea.medida}</td>
                    <td className="py-2.5 pr-4 font-mono text-body3 text-content-muted tnum">
                      {linea.codigo}
                    </td>
                    <td className="py-2.5 pr-4 text-right tnum">{linea.dias}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tnum">{linea.tarifa}</td>
                    <td className="py-2.5">
                      <Badge tone={linea.estado}>{linea.nombre}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-3 apparatus text-content-faint">
                    Subtotal
                  </td>
                  <td className="py-3 pr-4 text-right font-mono font-bold tnum">27,150.00</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button>Enviar al cliente</Button>
            <Button variant="secondary">Guardar borrador</Button>
            <Button variant="ghost">Duplicar</Button>
          </div>
        </div>
      </div>

      {/* ─── La escalera semántica ─────────────────────────────────────────── */}
      <Seccion titulo="La escalera semántica">
        <p className="mb-5 max-w-[65ch] text-body2 text-content-muted">
          Siete entradas fijas. Nada se pinta fuera de ellas. La muesca se dibuja maciza cuando el
          estado es terminal, así que «ya no se sale de aquí» se lee sin leer.
        </p>
        {/* Lista rayada, no rejilla de tarjetas: siete entradas en una rejilla de dos o tres
            columnas dejan huecos, y un hueco en una escalera se lee como una entrada que falta. */}
        <ul className="rule bg-panel">
          {ESCALERA.map((entrada) => (
            <li
              key={entrada.tone}
              className="flex flex-col gap-1 px-4 py-3 not-last:rule-b tablet:flex-row tablet:items-baseline tablet:gap-6"
            >
              <span className="tablet:w-40 tablet:shrink-0">
                <Badge tone={entrada.tone} filled={"filled" in entrada && entrada.filled}>
                  {entrada.nombre}
                </Badge>
              </span>
              <span className="text-body3 text-content-muted">{entrada.nota}</span>
            </li>
          ))}
        </ul>
      </Seccion>

      {/* ─── Controles ─────────────────────────────────────────────────────── */}
      <Seccion titulo="Controles">
        <div className="grid gap-6 tablet:grid-cols-2 laptop:grid-cols-3">
          <div className="flex flex-col gap-4">
            <Field label="Nombre del almacén" hint="Como lo verá el cliente en la cotización.">
              {(ids) => <Input {...ids} defaultValue="Renta Fílmica del Norte" />}
            </Field>

            <Field label="Correo de acceso" error="Ese correo ya pertenece a otra cuenta." required>
              {(ids) => <Input {...ids} type="email" defaultValue="almacen@rfn.mx" />}
            </Field>

            <Field label="Tarifa diaria" hint="Sin impuestos.">
              {(ids) => (
                <AmountInput
                  {...ids}
                  value={importe}
                  onValueChange={setImporte}
                  prefix="MXN"
                  decimal="."
                />
              )}
            </Field>
          </div>

          <div className="flex flex-col gap-4">
            <Field label="Frecuencia de cobro">
              {(ids) => (
                <Select {...ids} defaultValue="daily">
                  <option value="daily">Diaria</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </Select>
              )}
            </Field>

            <Field label="Condiciones de pago">
              {(ids) => (
                <Textarea {...ids} rows={3} defaultValue="50% al confirmar, 50% contra entrega." />
              )}
            </Field>

            <div className="flex flex-col gap-3 pt-1">
              <Checkbox
                defaultChecked
                label="Exigir firma en la entrega"
                hint="Pieza por pieza, con el código de cada unidad."
              />
              <Checkbox checked="indeterminate" label="Permisos de almacenes" hint="5 de 41" />
              <Switch checked={envio} onCheckedChange={setEnvio} label="Calcular envío" />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Pequeño</Button>
              <Button size="md">Mediano</Button>
              <Button size="lg">Grande</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary">Secundario</Button>
              <Button variant="ghost">Fantasma</Button>
              <Button variant="danger">Eliminar</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button loading>Guardando</Button>
              <Button disabled>Sin permiso</Button>
              <Spinner label="Cargando" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">Abrir diálogo</Button>
                </DialogTrigger>
                <DialogContent
                  title="Liberar las unidades apartadas"
                  description="Las cuatro unidades vuelven a estar disponibles para otras cotizaciones."
                  closeLabel="Cerrar"
                  footer={
                    <>
                      <Button variant="ghost">Cancelar</Button>
                      <Button variant="danger">Liberar</Button>
                    </>
                  }
                >
                  <p className="text-body2 text-content-muted">
                    Esta acción queda registrada en la bitácora y no se puede deshacer.
                  </p>
                </DialogContent>
              </Dialog>

              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary">Menú</Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuLabel>Idioma</MenuLabel>
                  <MenuRadioGroup value={tema} onValueChange={setTema}>
                    <MenuRadioItem value="es">Español</MenuRadioItem>
                    <MenuRadioItem value="en">English</MenuRadioItem>
                  </MenuRadioGroup>
                  <MenuSeparator />
                  <MenuItem>Exportar a PDF</MenuItem>
                  <MenuItem>Enlace público</MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </div>
        </div>
      </Seccion>

      {/* ─── Avisos ────────────────────────────────────────────────────────── */}
      <Seccion titulo="Avisos">
        <div className="grid gap-3 tablet:grid-cols-2">
          <Callout tone="info" label="Nota">
            La extracción del guion corre en segundo plano. Puedes cerrar esta pantalla.
          </Callout>
          <Callout tone="success" label="Listo">
            Se extrajeron 47 escenas de 6 capítulos. Falta revisarlas.
          </Callout>
          <Callout tone="warning" label="Atención">
            Dos unidades de esta medida ya están apartadas para otra cotización en las mismas
            fechas.
          </Callout>
          <Callout tone="danger" label="Error" live>
            El guion no se pudo leer. Sustitúyelo y vuelve a solicitar la extracción.
          </Callout>
        </div>
      </Seccion>

      {/* ─── Superficies y tipografía ──────────────────────────────────────── */}
      <Seccion titulo="Superficies y tipografía">
        <div className="grid gap-4 tablet:grid-cols-2">
          <Panel className="p-4">
            <span className="apparatus text-content-faint">Panel sobre lienzo</span>
            <p className="mt-2 text-body2 text-content-muted">
              Se separa por escalón de valor y filete, nunca por sombra. Una sombra difusa sugiere
              separación; un filete la afirma.
            </p>
            <Separator className="my-3" />
            <div className="grid grid-cols-3 gap-0">
              <div className="rule bg-canvas px-2 py-3 text-center apparatus">lienzo</div>
              <div className="rule bg-panel px-2 py-3 text-center apparatus">panel</div>
              <div className="rule bg-panel-sunken px-2 py-3 text-center apparatus">hundido</div>
            </div>
          </Panel>

          <Panel className="p-4">
            <span className="apparatus text-content-faint">Los pares que no se confunden</span>
            <p className="mt-2 text-body3 text-content-muted">
              El motivo real de la tipografía: en un sistema de códigos de unidad, confundir estos
              pares es un error de operación.
            </p>
            <p className="mt-3 font-mono text-h2 tnum">0O · 1lI · 5S · 8B · 2Z</p>
            <p className="mt-3 font-mono text-body2 text-content-muted tnum">
              SKY-60C-0114 · OCN-2575-0007
            </p>
            <Separator className="my-3" />
            <div className="flex flex-col gap-1">
              <span className="text-h1 font-bold">Título de pantalla</span>
              <span className="text-h3 font-bold">Título de bloque</span>
              <span className="text-body1">Cuerpo, quince píxeles</span>
              <span className="text-body3 text-content-muted">Secundario, trece</span>
              <span className="apparatus text-content-faint">Aparato, once</span>
            </div>
          </Panel>
        </div>
      </Seccion>
    </main>
  )
}
