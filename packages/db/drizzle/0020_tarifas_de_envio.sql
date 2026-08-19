-- Cuadro de tarifas de envío por empresa.
--
-- Ver `openspec/specs/shipping-rates/spec.md`, requisito «Las tarifas son datos configurables», y
-- la rebanada 17.
--
-- Existe para que cambiar una tarifa deje de ser un despliegue. Hasta ahora las tarifas y el tipo
-- de cambio eran constantes del código, y además duplicadas en el navegador (`DEFECTS.md` M-11):
-- un ajuste pedía dos despliegues coordinados y, entre uno y otro, la estimación que veía el
-- comprador no era lo que se le cobraba.
--
-- Los valores por omisión son el cuadro de la spec. Una empresa sin fila cobra con ese mismo cuadro
-- —lo resuelve la aplicación—, de modo que dar de alta una empresa no obliga a configurar envíos
-- antes de poder vender.
CREATE TABLE "shipping_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"volumetric_divisor" integer DEFAULT 5000 NOT NULL,
	"local_base" numeric(14, 2) DEFAULT '99.00' NOT NULL,
	"local_per_kilogram" numeric(14, 2) DEFAULT '20.00' NOT NULL,
	"national_base" numeric(14, 2) DEFAULT '199.00' NOT NULL,
	"national_per_kilogram" numeric(14, 2) DEFAULT '30.00' NOT NULL,
	"international_base" numeric(14, 2) DEFAULT '499.00' NOT NULL,
	"international_per_kilogram" numeric(14, 2) DEFAULT '60.00' NOT NULL,
	"distance_surcharges" jsonb DEFAULT '[{"over":500,"amount":"40.00"},{"over":1000,"amount":"80.00"}]'::jsonb NOT NULL,
	"item_surcharges" jsonb DEFAULT '[{"over":3,"amount":"20.00"},{"over":10,"amount":"50.00"}]'::jsonb NOT NULL,
	"exchange_currency" varchar(3),
	"exchange_rate" numeric(16, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_rates_company_unique" ON "shipping_rates" USING btree ("company_id");--> statement-breakpoint

-- ─── Quién alcanza el cuadro de tarifas ──────────────────────────────────────
--
-- Vía directa: la fila lleva su empresa, así que es el primero de los tres patrones de `0005`.
--
-- **Leer y escribir llevan aquí el mismo predicado**, y es deliberado. Una tarifa no es un
-- documento que la contraparte tenga que poder mirar: es configuración interna del comercio. Quien
-- compra no lee esta tabla, lee el importe ya calculado que viaja en su compra.
--
-- `app.current_companies()` es `member_of() || system_scope()`, así que la materialización del
-- pedido —que corre por `withSystem` declarando la empresa vendedora— alcanza la fila sin
-- necesidad de una cláusula propia. Es lo que la rebanada 18 necesitará para cobrar el envío con
-- las mismas tarifas con las que se estimó.
alter table public.shipping_rates enable row level security;--> statement-breakpoint

drop policy if exists arrendatario on public.shipping_rates;--> statement-breakpoint
create policy arrendatario on public.shipping_rates
  for all to authenticated
  using (shipping_rates.company_id = any((select app.current_companies())::uuid[]))
  with check (shipping_rates.company_id = any((select app.current_companies())::uuid[]));--> statement-breakpoint

-- La política de plataforma **no se hereda**: el bucle que la repartió en `0005` corrió una sola
-- vez, así que una tabla nueva nace sin ella. Es lo que le pasó a `prospects` (`0014`) y a
-- `background_jobs` (`0017`), y el modo de fallo no es «cerrado» sino abierto de par en par.
drop policy if exists plataforma on public.shipping_rates;--> statement-breakpoint
create policy plataforma on public.shipping_rates
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));
