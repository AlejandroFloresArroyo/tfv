# 30 · Trasvase de datos y corte — trabajo

## Decisiones previas

- [ ] Fijar la ventana de parada aceptable — propuesta con alternativas en
      `packages/trasvase/DECISIONES.md` §1: parada total corta, con la duración medida en ensayo
- [ ] Decidir el trato de las credenciales existentes — propuesta en
      `packages/trasvase/DECISIONES.md` §2; ojo: H-321, la pila nueva **no** consulta las
      contraseñas de `auth` de Supabase, así que la pregunta cambió de forma. El código avanza
      bajo el supuesto marcado: el hash bcrypt viaja tal cual a `users.password_hash`
- [x] Decidir el trato de las cuentas verificadas sin verificación real — **decidido el
      2026-08-19: se creen**. Se migran como verificadas. Pedirle otra vez el correo a quien lleva
      años entrando convertiría el corte en una reverificación masiva, y el defecto que las dejó
      así —`DEFECTS.md` S-15, el alta forzaba `valid: true`— ya no existe en la pila nueva: aquí
      el alta nace sin verificar y el enlace es lo que verifica
- [ ] Decidir si se reconstruye el historial de unidades — propuesta en
      `packages/trasvase/DECISIONES.md` §3: no reconstruir; asiento de apertura «migrado»
- [ ] Decidir el destino de las filas que no pasan las restricciones — propuesta en
      `packages/trasvase/DECISIONES.md` §4: cuarentena conservada e informada; implementada como
      supuesto de trabajo en `trasvase.cuarentena`

## Análisis previo

El comprobador existe, está probado con accesorios que representan los defectos de `DEFECTS.md`, y
se ejecuta con `pnpm --filter @tfv/trasvase analizar <directorio>`. Lo que falta en cada casilla es
lo mismo: **el volcado real no está disponible localmente**; el día que exista, correrlo es una
orden.

- [ ] Comprobar el volcado actual contra el esquema nuevo — herramienta lista
      (`packages/trasvase/src/analisis/`); falta el volcado real
- [ ] Cuantificar las filas que fallan por cada restricción — el informe ya lo hace por regla y
      restricción destino; falta el volcado real
- [ ] Inventariar las referencias rotas reales, no sólo las declaradas — el comprobador resuelve
      contra los `_id` presentes; falta el volcado real
- [ ] Inventariar las filas huérfanas de las cascadas defectuosas — separadas de las rotas en el
      informe; falta el volcado real
- [ ] Documentar una decisión por cada caso — los criterios por **tipo** de caso ya están en
      `packages/trasvase/DECISIONES.md`; las decisiones por caso concreto piden el volcado real

## Limpieza

- [ ] Corregir en origen lo que se pueda corregir — pide acceso al origen real; la cuarentena por
      corrida ya está pensada para ello: lo corregido sale solo al recorrer
- [x] Tabla de cuarentena para lo que no — `trasvase.cuarentena`, con regla, motivo y el documento
      entero; se reconstruye por colección en cada corrida
- [x] Informe de lo descartado, revisable por negocio — `informeCuarentena` y la orden
      `cuarentena` de la CLI

## Trasvase

Vive en `packages/trasvase` (nuevo), dirigido por volcado: las rutinas leen de un directorio de
`mongoexport`, nunca de una conexión viva. La idempotencia se prueba corriendo dos veces y
afirmando que la segunda no duplica nada, y dos mutaciones de afirmaciones centrales
—la correspondencia y el cuadre— muerden (20 y 1 pruebas en rojo respectivamente).

- [x] Rutina por dominio, repetible e idempotente — el patrón, transaccional y por dominio, está
      fijado y probado en los tres dominios construidos; los que faltan se registran en `DOMINIOS`
- [x] Correspondencia de identificadores antiguos a nuevos, conservada —
      `trasvase.correspondencia`, estable entre corridas; `companies.legacy_id` migra poblado
- [x] Núcleo: cuentas, empresas, membresías, roles, direcciones, contrapartes, taxonomías —
      con los criterios de desempate escritos en `DECISIONES.md`
- [x] Archivos y su metainformación — `core_meta` se absorbe en `uploads` como el destino pide;
      la meta perdida se deriva de la URL con incidencia
- [ ] Suscripciones, cobros y perfiles de facturación — suscripciones y cobros **migran y
      cuadran**; los perfiles de facturación (`core_companies_billing` → `merchant_profiles`) no
      se empezaron por plazo
- [ ] Almacenes y su catálogo — sin empezar por plazo; siguiente en el orden de dependencia
- [ ] Unidades, con su estado actual — sin empezar por plazo; condicionado a la decisión §3 de
      `DECISIONES.md` (historial no reconstruido, asiento de apertura)
- [ ] Cotizaciones y sus importes congelados — sin empezar por plazo
- [ ] Pedidos, compras, pagos y envíos — sin empezar por plazo
- [ ] Producciones y todo su contenido — sin empezar por plazo
- [ ] Pixit: catálogo, definiciones y libro de movimientos — sin empezar por plazo
- [ ] Sitios y personalizaciones — sin empezar por plazo
- [ ] Locaciones, sin reservas — sin empezar por plazo

## Archivos

- [ ] Copia de los objetos al proveedor nuevo
- [ ] **Reescritura de las direcciones persistidas en todas las tablas que las referencian**
- [ ] Verificación de que ninguna apunta al proveedor anterior
- [ ] Comprobación de que los enlaces compartidos anteriores siguen funcionando

## Compatibilidad

- [ ] Resolución de los identificadores de la pila anterior en URLs públicas
- [ ] Comprobación con una muestra de enlaces reales compartidos con clientes

## Verificación

- [x] Recuentos por entidad, origen contra destino — por dos vistas: `origen = migradas +
      cuarentena` por colección, y filas destino contra lo que la correspondencia predice por
      tabla; cubre lo trasvasado y se extiende con cada rutina nueva vía `TABLA_DESTINO`
- [ ] Cuadre de importes agregados de pagos, cobros y cotizaciones — los **cobros de suscripción**
      cuadran en centavos enteros por las dos puntas; pagos de comercio y cotizaciones no migran
      todavía, su cuadre llega con sus rutinas
- [ ] Muestreo manual de entidades representativas de cada dominio — el andamiaje está
      (`muestrear`, pares viejo↔nuevo con semilla, repetibles); el muestreo en sí pide el volcado
      real y ojos humanos
- [ ] Recorrido de extremo a extremo sobre los datos migrados — pide los dominios restantes y la
      aplicación completa delante

## Ensayo

- [ ] Ejecución completa sobre una copia reciente
- [ ] Medición del tiempo real de cada fase
- [ ] Repetición hasta que el tiempo entre en la ventana acordada
- [ ] Plan de vuelta atrás, probado

## Corte

- [ ] Congelación de escrituras en la pila anterior
- [ ] Trasvase final
- [ ] Verificación
- [ ] Redirección del tráfico y de los subdominios de tienda
- [ ] Reapuntado de los eventos del procesador de pagos al destino nuevo
- [ ] Observación reforzada durante las primeras horas

## Después

- [ ] Periodo de observación con la pila anterior en sólo lectura
- [ ] Conservación de la base de origen intacta hasta cerrar el periodo
- [ ] Retirada de la pila anterior
- [ ] Archivo de las rebanadas completadas
