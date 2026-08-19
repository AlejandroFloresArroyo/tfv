# Puesta en marcha del entorno de pruebas

Este documento se ejecuta de arriba abajo. No hace falta haber leído nada más.

Al terminar hay **un entorno de ensayo desplegado desde `dev`**: la aplicación web y la API en
Railway, la base y el almacenamiento en Supabase, con datos dentro y corriendo en modo producción.

Todo lo que sigue está escrito en el repositorio y **nada está activado**: no se pueden crear cuentas
ajenas desde aquí, ni conviene que estas credenciales pasen por nadie más. Son unos diez minutos.

> **Los tres nombres que hay que decidir antes de empezar.** Aparecen muchas veces más abajo:
>
> - el **proyecto de Supabase** — aquí `tfv-dev`
> - el **proyecto de Railway** — aquí `tfv-dev`
> - los **dos servicios** dentro de ese proyecto: se tienen que llamar **`api`** y **`web`**
>
> El nombre `api` no es decorativo: la web habla con la API por la red privada de Railway, en
> `http://api.railway.internal:8080`, y ese `api` **es el nombre del servicio**. Si le pones otro,
> cambia también la variable `API_ORIGIN` del paso 5.

---

## 0 · Lo que hay que tener

| | |
|---|---|
| Una cuenta de **Supabase** | La base y el almacenamiento de archivos |
| Una cuenta de **Railway** | Los dos procesos |
| Acceso al repositorio en GitHub | Railway despliega desde él |

**Por qué estos dos y no otros**, en corto:

- **La API no puede ir a un anfitrión sin servidor.** Es un proceso largo: levanta un despachador de
  trabajos con `setInterval` del que dependen el recolector de subidas abandonadas, la verificación
  de coherencia de existencias y la entrega de avisos. Sin proceso entre peticiones, esas tres dejan
  de correr **sin que nada falle**, que es la peor forma de dejar de funcionar. Railway tiene modelo
  de proceso, y su modo de dormir servicios es de activación explícita — hay que dejarlo apagado.
- **La web va al mismo sitio que la API**, y no a un anfitrión de borde. El plan gratuito de Vercel
  es de **uso no comercial** por sus propios términos, y su definición de comercial incluye
  expresamente cualquier despliegue de un proyecto que pida o procese pagos — que es esto, entorno de
  ensayo incluido. El plan que sí lo permitiría cuesta bastante más que el de Railway, y sería por un
  entorno de ensayo. Lo que compra el borde —caché repartida, optimización de imágenes— sólo vale
  algo con tráfico de producción.
- **La base es Supabase y no la de Railway.** No es preferencia: las migraciones de este repositorio
  dan por hecho el esquema `auth` y los roles `authenticated` y `service_role`, que **ninguna
  migración crea** porque los crea el proveedor. Y el almacenamiento de archivos es Supabase Storage.
  Sobre un PostgreSQL pelado, la primera migración revienta en su primer `grant`.

**Lo que cuesta**, comprobado el 2026-08-19 — vuelve a mirarlo, estas cifras caducan:

| | |
|---|---|
| Supabase, plan gratuito | 500 MB de base, 1 GB de archivos, 2 proyectos activos. **Se pausa tras una semana sin actividad** — aquí no llega a pausarse, porque el despachador consulta la base cada 30 s |
| Railway, plan Hobby | 5 $/mes, con 5 $ de consumo incluidos |

El plan gratuito de Railway trae 1 $ de consumo al mes y un límite de 0,5 GB de memoria por servicio;
para dos servicios encendidos todo el día se queda corto. Hobby es el suelo realista. Cuánto de esos
5 $ se come esto de verdad **depende del consumo medido** y Railway lo enseña en su tablero: míralo a
los pocos días en lugar de fiarte de esta línea.

---

## 1 · El proyecto de Supabase

1. Entra en <https://supabase.com/dashboard> y crea un proyecto nuevo, `tfv-dev`.
2. Elige región cercana y **guarda la contraseña de la base** que te pide inventar: se enseña una vez.
3. Espera a que el proyecto termine de aprovisionarse (un par de minutos).

Cuando esté listo, apunta estas tres cosas — las vas a necesitar en el paso 4:

| Dato | Dónde está |
|---|---|
| **Cadena de conexión** | Project Settings → Database → *Connection string* → pestaña **URI**. Sustituye `[YOUR-PASSWORD]` por la contraseña del punto 2 |
| **URL del proyecto** | Project Settings → API → *Project URL*. Tiene la forma `https://abcdefgh.supabase.co` |
| **Clave de servicio** | Project Settings → API → *Project API keys* → **`service_role`**. Es secreta: da acceso total al almacenamiento |

> **La cadena de conexión, con cuidado.** Coge la de **sesión** (puerto `5432`) o la del agrupador en
> modo sesión, no la de modo transacción (`6543`). Este servicio abre conexiones largas y usa
> transacciones con estado; el modo transacción se las corta por debajo.

---

## 2 · El proyecto de Railway y el servicio `api`

1. Entra en <https://railway.app/dashboard> → **New Project** → **Deploy from GitHub repo** → elige
   este repositorio.
2. Railway crea un servicio. Ábrelo → **Settings** y ponle:

   | Ajuste | Valor |
   |---|---|
   | **Service Name** | `api` |
   | **Branch** | `dev` |
   | **Root Directory** | *(vacío — la raíz del repositorio)* |
   | **Config-as-code path** | `apps/api/railway.toml` |

   El resto —cómo se construye, qué corre antes de aceptar tráfico, el chequeo de salud— ya está en
   ese archivo y no hay que tocarlo.

3. **Comprueba que el modo «Serverless» está apagado** (Settings → *Serverless* / *App Sleeping*).
   Dormido, el despachador de trabajos deja de correr y las tareas de fondo se paran en silencio.

4. Todavía **no despliegues**. Faltan las variables del paso 4.

---

## 3 · El servicio `web`

En el mismo proyecto: **New** → **GitHub Repo** → el mismo repositorio. Ábrelo → **Settings**:

| Ajuste | Valor |
|---|---|
| **Service Name** | `web` |
| **Branch** | `dev` |
| **Root Directory** | *(vacío)* |
| **Config-as-code path** | `apps/web/railway.toml` |

---

## 4 · Las variables del servicio `api`

Servicio `api` → **Variables** → pégalas todas. La columna de la derecha dice **de dónde sale cada
una**; ninguna se inventa.

| Variable | Qué contiene | De dónde sale |
|---|---|---|
| `NODE_ENV` | `production` | Literal. **No lo bajes a `development`**: media docena de comprobaciones sólo existen en producción, y el sentido de este entorno es ejercerlas |
| `PORT` | `8080` | Literal. Es el puerto por el que Railway enruta y con el que hace el chequeo de salud |
| `API_PORT` | `8080` | Literal, **el mismo que `PORT`**. El servicio lee este nombre; ver `apps/api/src/env.ts` |
| `API_HOST` | `::` | Literal. Escucha en IPv6 y en IPv4 a la vez, que es lo que hace falta para que la web lo alcance por la red privada |
| `DATABASE_URL` | La cadena de conexión completa | Paso 1, con la contraseña sustituida |
| `STORAGE_URL` | `https://<tu-proyecto>.supabase.co/storage/v1` | La *Project URL* del paso 1, con `/storage/v1` al final |
| `STORAGE_BUCKET` | `tfv` | Literal. Lo crea solo el despliegue; no hay que tocarlo en Supabase |
| `STORAGE_SERVICE_KEY` | La clave `service_role` | Paso 1. **Secreta**: no sale del servidor, el navegador sólo recibe autorizaciones firmadas para un objeto concreto |
| `PAYMENTS_WEBHOOK_SECRET` | Una frase larga al azar | La generas tú: `openssl rand -hex 32`. **Obligatoria en producción** — sin ella el servicio no arranca. Es lo que firma los eventos del procesador de pagos |
| `DOCUMENTS_LINK_SECRET` | Otra frase larga al azar, **distinta** | `openssl rand -hex 32`. **Obligatoria en producción**, mínimo 32 caracteres. Firma los enlaces públicos de los documentos; rotarla los invalida todos |
| `PAYMENTS_PROVIDER` | `local` | Literal, **mientras no haya procesador de pagos real**. Es un suplente que no mueve dinero y lo dice en el registro. Sin él, toda pantalla de cobro falla al abrirse |
| `CORS_ORIGINS` | La dirección pública de la web | Paso 6 — vuelves aquí cuando la tengas |
| `SITES_DOMAIN` | El dominio público de la web, **sin esquema** | Paso 6 |
| `BILLING_RETURN_ORIGIN` | La dirección pública de la web, **con esquema** | Paso 6 |
| `STOREFRONT_ORIGIN` | Igual que la anterior | Paso 6 |
| `COOKIE_PATH_PREFIX` | `/api` | Literal. La credencial de renovación viaja con `Path=/api/auth`; sin este prefijo declararía `/auth`, que no es el camino que el navegador pide, y **la sesión se caería al caducar en lugar de renovarse** |

Las cuatro últimas del paso 6 no se pueden rellenar todavía porque aún no existe el dominio. Deja
esas cuatro para el final; las demás ya valen.

---

## 5 · Las variables del servicio `web`

| Variable | Qué contiene | De dónde sale |
|---|---|---|
| `NODE_ENV` | `production` | Literal |
| `API_ORIGIN` | `http://api.railway.internal:8080` | Literal, **si el servicio de la API se llama `api`**. Es la red privada del proyecto: no pasa por internet y no cambia entre despliegues |
| `NEXT_PUBLIC_SITES_DOMAIN` | El dominio público de la web, sin esquema | Paso 6 |

> **Las dos se hornean en la compilación.** El reenvío de `/api/*` se resuelve al compilar y se
> escribe en el manifiesto, y `NEXT_PUBLIC_*` se incrusta en el paquete del navegador. Consecuencia
> práctica: **cambiar cualquiera de las dos exige volver a desplegar la web**, no basta con
> reiniciarla. Si la web sale compilada sin `API_ORIGIN`, el despliegue queda **mudo** —responde, se
> ve bien, y ninguna llamada llega— y no se entera nadie hasta abrirlo a mano.

---

## 6 · Los dominios, y las cinco variables que dependen de ellos

1. Servicio `web` → **Settings** → **Networking** → **Generate Domain**. Sale algo como
   `web-production-a1b2.up.railway.app`.
2. Servicio `api` → **Settings** → **Networking** → **Generate Domain**. La API **necesita dominio
   público además de la red privada**: los eventos del procesador de pagos llegan desde internet a
   `POST /payments/events`. Si le pone puerto, es el `8080`.
3. Vuelve a las variables y rellena las cinco que faltaban:

   | Servicio | Variable | Valor con el dominio del punto 1 |
   |---|---|---|
   | `api` | `CORS_ORIGINS` | `https://web-production-a1b2.up.railway.app` |
   | `api` | `SITES_DOMAIN` | `web-production-a1b2.up.railway.app` |
   | `api` | `BILLING_RETURN_ORIGIN` | `https://web-production-a1b2.up.railway.app` |
   | `api` | `STOREFRONT_ORIGIN` | `https://web-production-a1b2.up.railway.app` |
   | `web` | `NEXT_PUBLIC_SITES_DOMAIN` | `web-production-a1b2.up.railway.app` |

---

## 7 · Desplegar

Lanza el despliegue de los dos servicios (**Deploy**).

El de la API corre, antes de aceptar tráfico, `pnpm deploy:prepare`, que son tres cosas:

1. **Las migraciones**, y detrás la comprobación de que no falta ninguna. Si a la base le faltara
   alguna, el despliegue se planta en vez de arrancar sobre un esquema que no es el que el código
   cree.
2. **El depósito de archivos**: lo crea si no está, lo repara si está mal, y **comprueba desde donde
   mira el navegador** que sirve lectura pública y que admite escritura directa.
3. **Los marcadores de posición** de las imágenes.

Cómo se ve que fue bien, en el registro de la API:

```
Migraciones al día: 28 declaradas, 28 aplicadas.
servicio escuchando   url=http://:::8080  entorno=production
despachador de trabajos en marcha  cada=30000
```

Esas tres líneas juntas son la señal. La segunda dice `entorno=production`, que es el punto de todo
esto; la tercera es la que dice que las tareas de fondo están vivas.

---

## 8 · Meterle datos

El entorno todavía no tiene con qué entrar. La siembra deja 41 personas, 46 productos, dos empresas
y cuatro cuentas.

**La siembra se niega a correr en producción**, y es un candado puesto a propósito: sus contraseñas
son públicas y están escritas en el repositorio. Para un entorno de ensayo se le da permiso a mano,
una vez:

```sh
railway run --service api \
  -- env TFV_SIEMBRA_EN_PRODUCCION=acepto-que-las-contrasenas-son-publicas \
     node --experimental-strip-types apps/api/src/scripts/seed.ts
```

(Desde el tablero: servicio `api` → menú `⋮` → *Run a command*, con esa misma variable delante.)

El valor es literal y hay que copiarlo entero. Si falta, no siembra y explica cómo concederlo; si
está mal escrito, tampoco, y lo dice. Antes de escribir nada imprime un aviso con **a qué servidor y
a qué base** está a punto de sembrar — si ahí ves una base que no es la de ensayo, corta.

Al terminar imprime las cuentas. Todas comparten la contraseña `Desarrollo.2026`:

| Cuenta | Para ver |
|---|---|
| `admin@tfv.dev` | Administración de plataforma, y dos empresas |
| `duena@tfv.dev` | Propietaria de una empresa |
| `almacenista@tfv.dev` | Rol acotado: 5 de 255 permisos |
| `compradora@tfv.dev` | Sin membresías |

> **No pongas `TFV_SIEMBRA_EN_PRODUCCION` como variable fija del servicio.** Es para un comando
> suelto. Dejada puesta, cualquiera que reejecute la siembra la tiene concedida de antemano, que es
> justo lo que el candado evita.

---

## 9 · Comprobar que funciona

| Qué | Cómo | Qué tiene que salir |
|---|---|---|
| La API responde | `curl https://<dominio-api>/health` | `200` |
| La web responde | Abre `https://<dominio-web>/login` | La pantalla de entrar |
| **La web habla con la API** | Entra como `duena@tfv.dev` / `Desarrollo.2026` | Entra y se ve el panel. Si la pantalla se pinta pero entrar no hace nada, `API_ORIGIN` se compiló mal — paso 5 |
| Hay datos | Ve a Almacenes → Nave Monterrey | 46 productos |
| El almacenamiento sirve | Abre la ficha de un producto con foto | Se ve la imagen |
| Las tareas de fondo viven | Registro de la API, un minuto largo | Vuelven a aparecer líneas del despachador |

Lo último es la comprobación que justifica haber elegido este anfitrión: si el servicio se durmiera,
esas líneas dejarían de salir.

---

## 10 · Desbloquear la integración continua

**Ahora mismo no puede ejecutarse nada**, y no es por la configuración. La primera ejecución sobre
`chunk-ci` murió en 3 segundos con:

> The job was not started because your account is locked due to a billing issue.

Los tres trabajos, con la misma anotación, y otra vez al reintentarlo. GitHub llega a leer el
archivo y a repartir los trabajos antes de negarse, y el repositorio es **público** —donde los
ejecutores estándar no se cobran—, así que el bloqueo es **de la cuenta**, no de este repositorio ni
de este consumo.

1. Entra en <https://github.com/settings/billing> con la cuenta `AlejandroFloresArroyo`.
2. Resuelve lo que haya pendiente.
3. Vuelve a lanzar la ejecución: `gh run rerun --failed` o el botón *Re-run all jobs*.

Con eso, cada empuje verifica análisis, tipos, el desfase entre esquema y migraciones, y las 1 664
pruebas. Ver `.github/workflows/ci.yml`.

---

## Lo que este entorno todavía no tiene

Ninguna de las tres depende de este documento, y las tres están en `IMPLEMENTATION.md`:

- **No hay procesador de pagos real.** `PAYMENTS_PROVIDER=local` es un suplente que no mueve dinero.
  El endpoint que atenderá al real ya existe y ya se ejerce.
- **No hay envío de correo.** El enlace de verificación, el de recuperación y el de invitación se
  encolan y se quedan ahí. En este entorno se leen en el registro de la API.
- **Las cuentas sembradas tienen contraseña pública.** Este entorno no debe recibir datos reales de
  nadie.
