-- El descuento vive en la suscripción, no se recalcula en cada ciclo.
--
-- Ver `openspec/specs/subscriptions-and-entitlements/spec.md`, requisito «La renovación conserva los
-- descuentos», y la rebanada 11.
--
-- ## Qué corrige
--
-- La implementación anterior sincronizaba los asientos en cada renovación **reescribiendo las
-- líneas de la suscripción**, y al hacerlo borraba los descuentos y los códigos promocionales
-- aplicados (`DEFECTS.md` M-07). Quien contrataba con un quince por ciento por volumen lo perdía al
-- mes siguiente, sin que nadie lo tocara y sin que nada lo avisara: la factura simplemente subía.
--
-- Guardando el descuento en la fila de la suscripción, la sincronización de asientos no tiene por
-- qué mirarlo — que es justo la propiedad que hacía falta. Lo que se sincroniza es el número de
-- asientos, y el descuento es otra columna.
--
-- ## Escrita a mano
--
-- Como las 0004, 0005, 0008, 0009, 0014 y 0015. `drizzle-kit generate` **no puede correr en este
-- árbol**: los instantáneos 0016 y 0017 apuntan los dos al mismo padre —los generaron dos ramas en
-- paralelo desde 0013 y la fusión conservó los dos SQL sin rehacer la cadena—, y la herramienta se
-- detiene con «pointing to a parent snapshot … which is a collision». Ver `HALLAZGOS.md` H-87.

ALTER TABLE "company_subscriptions" ADD COLUMN "discount_percent" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "company_subscriptions" ADD COLUMN "promotion_code" varchar(60);--> statement-breakpoint
ALTER TABLE "company_subscriptions" ADD COLUMN "external_discount_id" varchar(120);--> statement-breakpoint

-- El barrido de la gracia busca las suscripciones cuyo plazo venció sin cobro, y son unas pocas
-- entre todas las vigentes. Sin índice parcial, el barrido recorre la tabla entera cada vez.
CREATE INDEX "company_subscriptions_grace_idx" ON "company_subscriptions" USING btree ("grace_period_ends_at") WHERE grace_period_ends_at is not null;
