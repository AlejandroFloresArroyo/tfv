-- La bitácora deja de estar escrita en español.
--
-- `title` era prosa libre —«Editó los datos de la empresa»— y el cuerpo del aviso se redactaba al
-- escribirlo, pegando el nombre de quien actuó delante de esa frase con la primera letra en
-- minúscula. Con eso, la bitácora y la bandeja eran las dos únicas pantallas de una aplicación que
-- se sirve en dos idiomas que no cambiaban de idioma (`HALLAZGOS.md` H-153, que es H-67 otra vez y
-- en la tabla que más filas acumula del sistema).
--
-- Lo que se guarda ahora es **una clave del catálogo y sus parámetros**. La frase la arma quien la
-- enseña, que es el único sitio donde se sabe en qué idioma leerla. El catálogo es cerrado y vive
-- en `@tfv/contracts/activity`, así que una clave que no exista no compila.
--
-- `title` se **retira** en lugar de convivir con la clave. Dejarla habría dado dos formas de decir
-- lo mismo y una migración que no arregla nada: el día que alguien escriba una y lea la otra, el
-- asiento vuelve a estar en español. No se traduce lo que había porque la bitácora es de sólo
-- anexado y no hay dónde consultarla salvo aquí — quien tenga filas escritas las tiene en una base
-- de desarrollo, y volver a sembrarla las regenera con clave.

ALTER TABLE "company_activities" ADD COLUMN "message_key" varchar(60) NOT NULL;--> statement-breakpoint
ALTER TABLE "company_activities" ADD COLUMN "message_params" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "company_activities" DROP COLUMN "title";
