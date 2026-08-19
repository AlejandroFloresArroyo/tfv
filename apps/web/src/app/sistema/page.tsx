"use client"

import {
  AmountInput,
  Badge,
  Button,
  Callout,
  Checkbox,
  Counter,
  cn,
  Dialog,
  DialogContent,
  DialogTrigger,
  Fact,
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
  Select,
  Spinner,
  StatCard,
  Switch,
  Textarea,
  type Tint,
} from "@tfv/ui"
import { useState } from "react"

/**
 * Referencia del sistema de diseño — Hoja de Llamado.
 *
 * **Andamio, no producto.** Existe para mirar el mundo visual completo sin levantar la base de
 * datos ni la API, y para tomar capturas en los cuatro tamaños y los dos temas. No consume ningún
 * dato y no está traducida: los textos van literales porque nombran piezas del sistema, no
 * interfaz de usuario final. Se borra con su directorio cuando el rediseño cierre.
 *
 * El contenido es vocabulario real del glosario —unidad, medida, apartado, pedido de almacén— y no
 * relleno: un sistema de diseño mirado con texto falso miente sobre lo que aguanta.
 */

const TEMPERATURAS: { tone: Tint; nombre: string; luz: string; nota: string }[] = [
  { tone: "reposo", nombre: "Borrador", luz: "sin luz", nota: "Nada comprometido todavía" },
  { tone: "curso", nombre: "En revisión", luz: "HMI · 5600 K", nota: "El cliente la está viendo" },
  {
    tone: "aparta",
    nombre: "Apartado",
    luz: "oro de marca",
    nota: "Unidades físicas comprometidas",
  },
  {
    tone: "cuida",
    nombre: "Por vencer",
    luz: "tungsteno · 3200 K",
    nota: "La ventana cierra en 2 días",
  },
  { tone: "firme", nombre: "Entregado", luz: "verde", nota: "Firmado pieza por pieza" },
  { tone: "alto", nombre: "Rechazado", luz: "luz de seguridad", nota: "El cliente declinó" },
  { tone: "leido", nombre: "Extraído", luz: "hora mágica", nota: "El modelo lo sacó del guion" },
]

const LINEAS: {
  medida: string
  codigo: string
  dias: number
  tarifa: string
  tone: Tint
  estado: string
}[] = [
  {
    medida: "ARRI SkyPanel S60-C",
    codigo: "SKY-60C-0114",
    dias: 5,
    tarifa: "1,850.00",
    tone: "aparta",
    estado: "Apartado",
  },
  {
    medida: "Cooke S4/i 32mm T2.0",
    codigo: "CKE-S4-0032",
    dias: 5,
    tarifa: "2,400.00",
    tone: "aparta",
    estado: "Apartado",
  },
  {
    medida: "Tripié O'Connor 2575D",
    codigo: "OCN-2575-0007",
    dias: 5,
    tarifa: "980.00",
    tone: "curso",
    estado: "Sin apartar",
  },
  {
    medida: "Cable 4/0 · 50 pies",
    codigo: "CBL-40-0231",
    dias: 3,
    tarifa: "160.00",
    tone: "reposo",
    estado: "Borrador",
  },
]

/** Agrupación de miles en español. Fija, no del navegador: si servidor y cliente formatearan
 *  distinto, la hidratación pintaría dos números diferentes para el mismo dato. */
const miles = (valor: number) => new Intl.NumberFormat("es-MX").format(valor)

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-edge border-t px-5 py-10 tablet:px-8 laptop:px-12">
      <h2 className="display mb-6 text-h2 text-content">{titulo}</h2>
      {children}
    </section>
  )
}

/** Las cuatro combinaciones de fondo que hay sobre la mesa. Ninguna está decidida. */
const FONDOS = [
  { id: "nada", nombre: "Sin fondo", clase: "" },
  { id: "derrame", nombre: "Derrame de luz", clase: "atmos-derrame" },
  { id: "grano", nombre: "Grano", clase: "atmos-grano" },
  { id: "ambos", nombre: "Los dos", clase: "atmos-derrame atmos-grano" },
] as const

export default function SistemaPage() {
  const [fondo, setFondo] = useState<(typeof FONDOS)[number]["id"]>("nada")
  const [importe, setImporte] = useState("1850.00")
  const [idioma, setIdioma] = useState("es")
  const [envio, setEnvio] = useState(true)

  return (
    <main
      className={cn(
        "mx-auto min-h-dvh w-full max-w-[120rem] bg-canvas text-content",
        FONDOS.find((f) => f.id === fondo)?.clase,
      )}
    >
      {/* Andamio de decisión: el fondo todavía no está elegido, así que se puede ver cada opción
          sobre el tablero real en vez de sobre una muestra. No forma parte del sistema. */}
      <div className="flex flex-wrap items-center gap-2 border-edge border-b px-5 py-3 tablet:px-8 laptop:px-12">
        <span className="legend mr-1 text-content-faint">Fondo en evaluación</span>
        {FONDOS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={fondo === f.id ? "primary" : "secondary"}
            onClick={() => setFondo(f.id)}
          >
            {f.nombre}
          </Button>
        ))}
      </div>

      {/* ─── La cabecera de un llamado: los hechos duros del día ─────────────── */}
      <header className="px-5 pt-10 pb-8 tablet:px-8 laptop:px-12">
        <span className="legend text-content-faint">Renta Fílmica del Norte · Almacén Centro</span>
        <h1 className="display mt-2 text-fluid3 text-content">Hoja de llamado</h1>
        <p className="mt-3 max-w-[62ch] text-body1 text-content-muted">
          Todo lo del día en una sola superficie. Cada estado toma una temperatura de set
          —tungsteno, HMI, hora mágica— así que el color dice algo antes de que nadie lea la
          etiqueta.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-6 tablet:grid-cols-4">
          <Fact label="Fecha" value="19 AGO" hint="martes" />
          <Fact label="Día" value="4 / 18" hint="de rodaje" />
          <Fact label="Citación" value="06:30" hint="en bodega" />
          <Fact label="Puesta de sol" value="20:07" hint="magic hour 19:24" />
        </div>
      </header>

      {/* ─── Tablero: las tarjetas con degradado ─────────────────────────────── */}
      <section className="px-5 pb-10 tablet:px-8 laptop:px-12">
        <div className="grid gap-4 tablet:grid-cols-2 laptop:grid-cols-4">
          {/* El encendido va escalonado: un panel de control alimentándose, no cuatro tarjetas
              apareciendo a la vez. El retardo es lo único que hace falta para que se lea como
              secuencia y no como parpadeo. */}
          <StatCard
            tint="firme"
            live
            boot
            label="Unidades disponibles"
            value={<Counter value={1284} format={miles} />}
            trend="+38 esta semana"
          />
          <StatCard
            tint="aparta"
            live
            boot
            style={{ animationDelay: "90ms" }}
            label="Apartadas"
            value={<Counter value={207} format={miles} durationMs={950} />}
            trend="14 se liberan hoy"
          />
          <StatCard
            tint="curso"
            live
            boot
            style={{ animationDelay: "180ms" }}
            label="Cotizaciones por responder"
            value={<Counter value={9} durationMs={700} />}
            trend="3 vencen mañana"
          />
          {/* La única que respira, y se lo gana: la extracción del guion está corriendo de verdad
              en segundo plano. Si esto fuera adorno, en dos días nadie miraría la señal. */}
          <StatCard
            tint="leido"
            live
            alive
            label="Escenas extraídas"
            value={<Counter value={47} durationMs={1100} />}
            trend="extrayendo del guion ahora"
          />
        </div>
        <p className="mt-4 max-w-[68ch] text-body3 text-content-faint">
          Pasa el ratón por una tarjeta: sube el degradado y se tiñe el borde, sin que nada se mueva
          de sitio. La cuarta respira porque su trabajo está corriendo de verdad en segundo plano —
          es la única señal continua del sistema, y sólo se pone donde es cierta.
        </p>
      </section>

      {/* ─── Cotización ──────────────────────────────────────────────────────── */}
      <Seccion titulo="Cotización">
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-edge border-b px-5 py-4">
            <div className="flex items-baseline gap-3">
              <span className="display text-h3">COT-2026-00418</span>
              <span className="text-body3 text-content-muted">Producciones Vela</span>
            </div>
            <Badge tone="aparta">Apartado</Badge>
          </div>

          {/* Tacto: una ficha por línea. Desplazar en horizontal escondería tarifa y estado. */}
          <ul className="tablet:hidden">
            {LINEAS.map((l) => (
              <li
                key={l.codigo}
                className="flex flex-col gap-2 px-5 py-4 not-last:border-edge not-last:border-b"
              >
                <span className="text-body1 font-semibold text-content">{l.medida}</span>
                <span className="font-mono text-body3 text-content-muted tnum">{l.codigo}</span>
                <div className="flex items-center justify-between gap-4">
                  <Badge tone={l.tone}>{l.estado}</Badge>
                  <span className="display font-mono text-h4 tnum">{l.tarifa}</span>
                </div>
              </li>
            ))}
          </ul>

          <table className="hidden w-full border-collapse text-left tablet:table">
            <thead>
              <tr className="border-edge border-b">
                <th className="px-5 py-3 legend text-content-faint">Medida</th>
                <th className="px-5 py-3 legend text-content-faint">Código</th>
                <th className="px-5 py-3 text-right legend text-content-faint">Días</th>
                <th className="px-5 py-3 text-right legend text-content-faint">Tarifa</th>
                <th className="px-5 py-3 legend text-content-faint">Reserva</th>
              </tr>
            </thead>
            <tbody>
              {LINEAS.map((l) => (
                <tr key={l.codigo} className="not-last:border-edge not-last:border-b">
                  <td className="px-5 py-3.5 text-body2 text-content">{l.medida}</td>
                  <td className="px-5 py-3.5 font-mono text-body3 text-content-muted tnum">
                    {l.codigo}
                  </td>
                  <td className="px-5 py-3.5 text-right text-body2 tnum">{l.dias}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-body2 tnum">{l.tarifa}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={l.tone}>{l.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-4 border-edge border-t px-5 py-4">
            <span className="legend text-content-faint">Subtotal</span>
            <span className="display text-h2 tnum">27,150.00</span>
          </div>
        </Panel>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button>Enviar al cliente</Button>
          <Button variant="secondary">Guardar borrador</Button>
          <Button variant="ghost">Duplicar</Button>
        </div>
      </Seccion>

      {/* ─── Las temperaturas ────────────────────────────────────────────────── */}
      <Seccion titulo="Las temperaturas">
        <div className="grid gap-4 tablet:grid-cols-2 laptop:grid-cols-3">
          {TEMPERATURAS.map((t) => (
            <Panel key={t.tone} tint={t.tone} className="flex flex-col gap-2 p-5">
              <Badge tone={t.tone}>{t.nombre}</Badge>
              <span className="mt-1 text-body2 text-content">{t.nota}</span>
              <span className="legend text-content-faint">{t.luz}</span>
            </Panel>
          ))}
        </div>
      </Seccion>

      {/* ─── Controles ───────────────────────────────────────────────────────── */}
      <Seccion titulo="Controles">
        <div className="grid gap-8 tablet:grid-cols-2 laptop:grid-cols-3">
          <div className="flex flex-col gap-5">
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

          <div className="flex flex-col gap-5">
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
            <div className="flex flex-col gap-4">
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
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Pequeño</Button>
              <Button size="md">Mediano</Button>
              <Button size="lg">Grande</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary">Secundario</Button>
              <Button variant="ghost">Fantasma</Button>
              <Button variant="danger">Eliminar</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button loading>Guardando</Button>
              <Button disabled>Sin permiso</Button>
              <Spinner label="Cargando" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
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
                  <MenuRadioGroup value={idioma} onValueChange={setIdioma}>
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

      {/* ─── Avisos ──────────────────────────────────────────────────────────── */}
      <Seccion titulo="Avisos">
        <div className="grid gap-4 tablet:grid-cols-2">
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

      {/* ─── Tipografía ──────────────────────────────────────────────────────── */}
      <Seccion titulo="Tipografía">
        <div className="grid gap-4 tablet:grid-cols-2">
          <Panel className="flex flex-col gap-3 p-6">
            <span className="legend text-content-faint">La voz de display</span>
            <span className="display text-h1">Archivo, expandida al 118%</span>
            <p className="text-body2 text-content-muted">
              La misma familia que el cuerpo, con su eje de ancho abierto. La letra de rótulo de
              panel de control sale de ahí, no de una tipografía disfraz de ciencia ficción.
            </p>
            <div className="mt-2 flex flex-col gap-1">
              <span className="display text-h2">Título de bloque</span>
              <span className="text-body1">Cuerpo, quince píxeles</span>
              <span className="text-body3 text-content-muted">Secundario, trece</span>
              <span className="legend text-content-faint">Leyenda, doce</span>
            </div>
          </Panel>

          <Panel className="flex flex-col gap-3 p-6">
            <span className="legend text-content-faint">Los pares que no se confunden</span>
            <p className="text-body2 text-content-muted">
              La monoespaciada sobrevive por una razón de producto: este sistema está lleno de
              códigos donde confundir estos pares es un error de operación.
            </p>
            <p className="font-mono text-h2 tnum">0O · 1lI · 5S · 8B</p>
            <p className="font-mono text-body2 text-content-muted tnum">
              SKY-60C-0114 · OCN-2575-0007
            </p>
          </Panel>
        </div>
      </Seccion>
    </main>
  )
}
