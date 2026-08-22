# Decisiones previas del trasvase — propuestas

Las cuatro casillas de «Decisiones previas» de la rebanada 30 son del dueño del producto. Aquí
está cada una **propuesta con sus alternativas**, y dónde el código necesitaba una respuesta para
avanzar se trabaja bajo el supuesto propuesto, **marcado como supuesto** en el código y aquí. Las
casillas de `tasks.md` quedan sin marcar.

La quinta ya está decidida (2026-08-19): las cuentas verificadas sin verificación real (S-15)
**se migran como verificadas**. Implementado en la rutina del núcleo: `valid: true` →
`email_verified_at = createdAt` del documento.

---

## 1 · La ventana de parada

**Propuesta: parada total corta, en horario de mínimo uso, con la duración medida en ensayo —no
estimada— antes de acordarla.**

La arquitectura elegida hace la duración predecible: el trasvase lee de un volcado, no de la base
viva, así que el ensayo sobre una copia reciente (sección «Ensayo», pendiente de datos reales) da
el tiempo real de cada fase. La ventana que se acuerde debe ser **ensayo medido × 2**, no un deseo.

| Alternativa | Por qué no |
|---|---|
| Doble corrida (una en caliente + delta con parada corta) | Exige detectar deltas en Mongo (oplog o marcas `updatedAt`) y complica la idempotencia por poco beneficio: el volumen de la pila vieja no apunta a horas de carga. Reconsiderar sólo si el ensayo mide una duración inaceptable. |
| Sin parada, con doble escritura | Meses de trabajo de sincronización bidireccional para un sistema que se está reemplazando entero. Desproporcionado. |

**Supuesto de trabajo en el código:** ninguno; las rutinas no dependen de la ventana.

## 2 · El trato de las credenciales existentes

**Hallazgo previo que cambia la pregunta** (ver `openspec/HALLAZGOS.md` H-321): la pila nueva **no
delega las contraseñas en el esquema `auth` de Supabase**. La identidad vive en `users` propia:
`users.password_hash` con formato versionado (`scrypt$N$r$p$sal$hash`, en
`apps/api/src/auth/password.ts`), y del esquema `auth` del proveedor sólo se consumen `auth.uid()`
y `auth.sessions` para las políticas de aislamiento. Importar contraseñas a `auth.users` de
Supabase —lo que su herramienta de migración admite, incluidos hashes bcrypt— sería importarlas a
un sistema que **el inicio de sesión no consulta**. Esa vía queda descartada por los hechos, no
por preferencia.

La pila vieja deriva con **bcrypt, coste 10** (`tfv-backend/src/utils/hash.ts`, `bcryptjs`).

**Propuesta: migrar el hash bcrypt tal cual a `users.password_hash` y enseñar a la verificación
nueva a reconocerlo como algoritmo heredado.** El formato versionado existe exactamente para esto:
`verifyPassword` gana una rama bcrypt (dependencia `bcryptjs`, ~20 líneas, propiedad del equipo de
`apps/api`) y `needsRehash` ya devuelve verdadero para todo lo que no sea scrypt vigente, así que
**cada cuenta se rederiva a scrypt sola, en su primer inicio de sesión**, sin pedirle nada a nadie.
Bcrypt coste 10 sigue siendo un hash razonable para el periodo de transición.

| Alternativa | Por qué no |
|---|---|
| Anular los hashes y forzar «recuperar contraseña» a todo el mundo | Destruye información y convierte el corte en un incidente masivo de soporte; el correo de recuperación depende además de que toda la mensajería esté impecable el día uno. Es la opción si se decide que bcrypt-10 no es aceptable ni transitoriamente. |
| Importar a `auth.users` de Supabase | Descartada por H-321: nadie consulta esa tabla para entrar. |

**Supuesto de trabajo en el código (marcado):** la rutina del núcleo copia `password` → 
`password_hash` tal cual. Mientras `apps/api` no reconozca bcrypt, esas cuentas no pueden entrar
con contraseña, pero **no se pierde nada**: si la decisión fuera anular, es cambiar una línea y
recorrer de nuevo. La verificación nueva ya devuelve «falso» ante un formato irreconocible, no
lanza, así que el estado intermedio es seguro.

## 3 · ¿Se reconstruye el historial de unidades?

**Propuesta: no reconstruir. Migrar el estado actual de cada unidad con un único asiento de
apertura «migrado», y conservar el volcado viejo como archivo consultable.**

El historial nuevo será un registro de hechos; fabricar hechos retroactivos desde un origen que no
los registró como tales (los defectos C-06/C-07/F-10 muestran que el libro viejo se editaba y
borraba) produciría un historial con autoridad aparente y verdad dudosa. Un asiento de apertura
honesto —«esta unidad entró así el día del corte»— deja claro dónde empieza lo confiable.

| Alternativa | Por qué no |
|---|---|
| Reconstruir eventos aproximados desde `createdAt`/`updatedAt` y estados | Inventa datos con cara de auditoría. Peor que no tenerlos. |
| Migrar el libro viejo tal cual a las tablas nuevas de historial | Arrastra los huecos de las cascadas defectuosas a un sistema cuyo valor es precisamente no tenerlos. |

**Supuesto de trabajo en el código:** la rutina de unidades no está construida (quedó fuera del
alcance de esta corrida); cuando se construya, seguirá esta propuesta salvo decisión contraria.

## 4 · El destino de las filas que no pasan las restricciones

**Propuesta: cuarentena en la base nueva, con informe legible, revisión caso por caso, y
conservación hasta después del periodo de observación.** Implementado: `trasvase.cuarentena`
guarda la fila **entera** (documento original en `jsonb`) con su regla y su motivo;
`informeCuarentena` la cuenta y explica para negocio; la corrida nunca se rompe por una fila mala.
Lo corregible se corrige **en el origen** y se recorre otra vez: la cuarentena de cada colección
se reconstruye por corrida, así que una fila arreglada sale sola.

| Alternativa | Por qué no |
|---|---|
| Migrar «a la fuerza» relajando restricciones del destino | Las restricciones nuevas son el contrato del sistema nuevo; agujerearlas el día uno es heredar los defectos con papeles nuevos. |
| Tirarlas | Hay dinero e identidad en esas filas. No. |

**Supuesto de trabajo en el código (implementado):** el descrito arriba. La única decisión fina
pendiente es por cuánto tiempo se conserva `trasvase.cuarentena` tras el corte; propuesta: al
menos hasta retirar la pila anterior.

---

## Criterios de desempate implementados (decisiones menores, revisables)

Estos no son las cuatro casillas: son políticas que el código necesitaba y que quedan escritas
para poder discutirse mirando una tabla y no un diff.

| Conflicto | Restricción nueva | Criterio implementado |
|---|---|---|
| Dos cuentas con el mismo correo | `users_email_unique` | Gana la de **último inicio de sesión**; sin ninguno, la más antigua. El resto, a cuarentena. |
| Dos membresías de la misma pareja | `company_members_unique` | Gana la **dueña**, luego la activa, luego la más antigua. |
| Dos direcciones primarias en una libreta | `*_addresses_primary_unique` | Conserva la primaria la **tocada más recientemente**; la otra migra como no primaria, con incidencia. |
| Dos suscripciones no canceladas de una empresa | `company_subscriptions_company_unique` | Gana la que la empresa nombra en su `companySubscriptionId`; sin voto, la de periodo más reciente. |
| Dos contrapartes de la misma pareja | `counterparties_*_pair_unique` | Gana la primera; el resto, a cuarentena. |
| Slug o keyname de categoría repetido | `global_categories_*_unique` | La fila migra y **suelta el slug/keyname**, con incidencia; no se pone en cuarentena un subárbol por un slug. |
| Empresa cuyo dueño no existe | — (el destino no exige dueño) | Migra sin membresía de dueño, con incidencia. |
| Dueño declarado sin membresía | `company_members.isOwner` | Se **sintetiza** la membresía de dueño, con correspondencia estable (`trasvase_membresia_dueño`). |
