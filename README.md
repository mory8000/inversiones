# Mis Inversiones

App para llevar el control de tus **depósitos, fondos, carteras y planes de pensiones**, al estilo de MyInvestor.
Registra cada movimiento de dinero y la app te enseña, de forma clara, **de dónde viene y a dónde va cada euro**,
cuánto has invertido, cuánto ha vuelto a tus cuentas y cuánto has ganado.

**Abrir la app → https://mory8000.github.io/inversiones/** (funciona en el ordenador y en el móvil, y se puede
instalar como una app).

Sustituye al antiguo `Inversiones.xlsx` y mantiene sus mismos conceptos: titular (código y nombre), cuenta
**De → A**, y por cada tipo de producto *Invertido · Reembolso · Traspaso · % · € · Saldo*.

![Inicio en escritorio](docs/captura-inicio.jpg)

<p align="center">
  <img src="docs/movil-inicio.jpg" width="200" alt="Inicio en el móvil: la tarjeta del titular principal, con su transferencia mensual y el botón Editar">
  <img src="docs/movil-myinvestor.jpg" width="200" alt="La ventana de MyInvestor: añadir dinero, invertir, programar la transferencia mensual">
  <img src="docs/movil-ventanillas.jpg" width="200" alt="Una ventanilla por inversión, en el orden que elijas">
  <img src="docs/movil-movimientos.jpg" width="200" alt="Movimientos en el móvil">
  <img src="docs/movil-flujo.jpg" width="200" alt="Flujo del dinero en el móvil">
</p>

> Las capturas usan los **datos de ejemplo** (ficticios) que se pueden cargar desde la propia app.

## Qué puedes hacer

- **Inicio**: lo primero que se ve son **todos los titulares a la vez** y **una ventanilla por cada inversión**
  (fondo, cartera, depósito…):
  - La tarjeta de cada titular (el primero es el principal) con su patrimonio, su rentabilidad, lo invertido, lo
    que tiene sin invertir en su cuenta **MyInvestor** y lo aportado. Las cifras de cada titular van por
    separado: la cifra grande del principal es todo lo suyo, sin el «Fondo ahorro» (que tiene su propia tarjeta).
  - En la del principal está su cuenta **MyInvestor**, sus **transferencias mensuales** (cada una con su botón
    **«Editar»**, para cambiar el importe, el día o hasta cuándo, o eliminarla) y el botón **«Abrir MyInvestor»**.
  - **Ventana de MyInvestor** (al abrirla): su **saldo real** (positivo o negativo), **Añadir dinero** (desde una
    cuenta externa), **Invertir**, **Programar transferencia mensual**, **Sacar dinero**, sus transferencias
    mensuales (con **Editar**) y el **dinero añadido desde bancos externos**, cada movimiento con sus botones
    **Editar** y **Borrar**.
  - **Ventanillas**: al tocar una se abre con su saldo, su **% de rentabilidad** (o su **interés**, en los
    depósitos) con el botón para cambiarlo, y con lo que se puede hacer: **Aportar**, **Retirar** (reembolso),
    **Traspasar**, **Programar transferencia mensual** y ver sus movimientos (con **Editar** y **Borrar**).
  - **Ordenar**: pon las ventanillas en el orden que quieras, arrastrándolas o con «Antes» / «Después». El orden
    se guarda y se usa también en *Inversiones*.
  - Debajo: la evolución (una línea por titular), dónde está el dinero de cada uno, el diagrama del flujo del
    dinero, el resumen por tipo de cada titular (como el Excel), los últimos movimientos y las cuentas.
- **% de beneficio o pérdida**: en cada fondo, cartera, plan… se pone el % que gana o pierde (**«Gana (sube)» o
  «Pierde (baja)»**): si las acciones suben un 3 %, se pone 3 y su saldo pasa a ser el capital + 3 %. Se ve al
  momento en su ventanilla y en el patrimonio de su titular. También se puede poner su valor en euros.
- **Interés variable en los depósitos**: «Cambiar interés» pone la nueva TAE **desde una fecha** (hoy, otra
  fecha o desde el principio para corregirla). Los días de antes se siguen calculando con el interés anterior.
- **Deshacer**: el botón **«Deshacer»** de arriba deshace el último cambio: un movimiento apuntado, cambiado o
  borrado, un %, un interés, una transferencia mensual… Se pueden deshacer varios seguidos. Al hacer un cambio
  solo sale un aviso corto («Movimiento guardado»…), sin botones, que se va solo; al deshacer, el aviso trae
  **«Rehacer»** por si te arrepientes. El historial se guarda en el dispositivo, así que sigue ahí aunque se
  cierre la app. En el ordenador también vale **Ctrl+Z** (y **Ctrl+Y** para rehacer).
- **No se puede aportar más dinero del que hay** en MyInvestor (ni en otra cuenta con saldo): si se intenta,
  sale un aviso con lo que hay disponible, lo que falta y un botón para «Añadir dinero». Se comprueba en la fecha
  del movimiento y después (si luego hay más salidas, tampoco pueden quedarse sin dinero). Al programar una
  transferencia mensual que empieza en el pasado, se comprueba que haya dinero para las que ya tocan.
- **Movimientos**: todos los movimientos de todos los titulares, con su origen (**De**) y destino (**A**) y de quién
  es cada uno, agrupados por meses. Filtros por titular, tipo, cuenta o producto, tipo de producto y periodo;
  buscador; y exportación a Excel (CSV).
- **Flujo del dinero**: diagrama de bandas en tres columnas — *de dónde viene* (tus cuentas, traspasos y la
  rentabilidad), *dónde está* (tus productos) y *a dónde va* (reembolsos, traspasos y lo que sigue invertido).
  Toca una caja para ver su recorrido. Se puede ver todo el histórico o un periodo concreto.
  En el móvil se muestra en dos pasos para que se lea bien.
- **Inversiones**: tus productos agrupados por tipo (depósitos, fondos, carteras, planes de pensiones, acciones
  y otros) y tus cuentas.
- **Detalle de cada producto**: el cálculo del saldo paso a paso, de dónde le ha llegado el dinero y a dónde ha
  ido, su evolución y sus movimientos. En los depósitos: TAE, vencimiento, días restantes e intereses.
- **Cuentas con saldo y cuentas externas**:
  - **Con saldo (como MyInvestor)**: el dinero que hay en ella es del titular y suma en su patrimonio. La app
    calcula su **saldo real** con lo que entra y lo que sale: puede ser positivo o negativo (si es negativo, se ve
    en rojo y resta). El titular principal tiene la suya, **«MyInvestor»**, que es su cuenta principal.
  - **Externa (otro banco)**, p. ej. la cuenta nómina: indica de dónde viene el dinero (**aportaciones**) o a
    dónde va. No lleva saldo ni suma en el patrimonio.
  - Con **«Añadir dinero»** se apunta una aportación de una cuenta externa a MyInvestor (si aún no tienes ninguna
    cuenta externa, se crea «Cuenta externa» y luego le puedes cambiar el nombre). Esas aportaciones se pueden
    **editar o borrar** desde la ventana de MyInvestor (si al borrarla la cuenta se quedara en negativo, avisa).
- **Detalle de cada cuenta**: su saldo (si lo lleva), lo que ha entrado y salido, a qué productos ha ido el dinero
  y lo que ha vuelto.
- **Varios titulares, vistos a la vez**: la app empieza con «Titular 1» (el principal) y «Titular 2»; ponles
  nombre desde la propia app. Cada cuenta y cada producto es de un titular, cada titular tiene su color y sus
  cifras van siempre por separado (nunca se suman las de varios titulares). Desde
  *Ajustes → Titulares* se puede añadir otro titular o elegir cuál es el principal (código y nombre, como en la
  cabecera del Excel).
- **Transferencia mensual**: por ejemplo, de MyInvestor del titular 1 a un fondo o cuenta del titular 2. Se
  programa una vez, **dentro de la ventana de MyInvestor** o de la ventanilla de la inversión (importe, día, desde
  qué cuenta y a qué producto o cuenta), y la app la apunta sola cada mes. Para cambiarla o eliminarla, su botón
  **«Editar»** está en la tarjeta del titular, en la ventana de MyInvestor y en *Ajustes → Transferencias
  mensuales*. Un mes concreto se puede cambiar o borrar sin tocar los demás.
- **El dinero cuenta para quien lo recibe**: si sale de la cuenta del titular 1 y entra en un producto o en una
  cuenta con saldo del titular 2, cuenta solo para el titular 2, no para el titular 1 (en la cuenta del titular 1
  se ve como dinero que ha salido).
- **Ocultar importes** con un toque (icono del ojo).
- **Copia de seguridad** (descargar / restaurar) y **datos de ejemplo** para probarla sin miedo.
- **Se instala como una app** en el móvil o el ordenador y funciona **sin conexión**.

## Tipos de movimiento

Solo tienes que elegir de dónde sale el dinero y a dónde va; el tipo se deduce solo:

| Tipo              | De (origen) | A (destino) | Ejemplo                                      |
| ----------------- | ----------- | ----------- | -------------------------------------------- |
| **Inversión**     | Cuenta      | Producto    | 1.000 € de la cuenta nómina a un fondo       |
| **Reembolso**     | Producto    | Cuenta      | Vence un depósito y vuelve a la cuenta       |
| **Traspaso**      | Producto    | Producto    | Pasas dinero de un fondo a otro              |
| **Transferencia** | Cuenta      | Cuenta      | Mueves dinero entre tus cuentas              |

Una transferencia de una **cuenta externa** a una **cuenta con saldo** (como MyInvestor) se ve como
**«Aportación»**; al revés, como **«Retirada»**.

Si el origen y el destino son de **titulares distintos**, el movimiento se ve como **«Entre titulares»**. Para
quien lo recibe en un producto o en una cuenta con saldo es dinero suyo (una aportación); para quien lo envía, no.

## Cómo se calcula

Las mismas fórmulas que el Excel, para cada producto:

```
Invertido = aportado desde cuentas + traspasos recibidos
Capital   = Invertido − Reembolsado − Traspasos enviados
Saldo     = Capital × (1 + %)
€         = Saldo − Capital            (rentabilidad en euros)
```

El valor de cada producto se puede actualizar de dos formas (botón **Cambiar %**):

- **Rentabilidad (%)**, como en el Excel, positiva o negativa: `Saldo = Capital × (1 + %)`. Por ejemplo, con
  1.000 € y +3 %, 1.030 €; con −2 %, 980 €.
- **Valor de mercado (€)**: el valor que ves en la app de tu banco. Los movimientos posteriores se suman o restan.

En los **depósitos** el interés se calcula solo con la TAE (interés simple): `capital × TAE × días / 365`,
desde la primera aportación hasta hoy o hasta el vencimiento. Si el interés cambia, cada tramo se calcula con la
TAE que regía entonces y se suman.

Cuando sacas todo el dinero de un producto (por ejemplo, al vencer un depósito), queda como **cerrado** y su
resultado final es lo que has recuperado menos lo que invertiste.

Y para cada titular:

```
Saldo de una cuenta con saldo = lo que ha entrado − lo que ha salido      (real: positivo o negativo)
Patrimonio = saldo de sus productos + saldo de sus cuentas con saldo (MyInvestor)
Aportado   = lo que ha entrado desde fuera (cuentas externas u otros titulares)
```

Las cifras de varios titulares nunca se suman: cada uno ve solo lo suyo.

Si el saldo de MyInvestor queda en negativo (por ejemplo, al borrar dinero añadido que ya se había invertido, o
si una transferencia mensual llega sin dinero suficiente), se ve en rojo, resta en el patrimonio y la app avisa
de que falta apuntar de dónde vino el dinero («Añadir dinero», dentro de la ventana de MyInvestor).

## Tus datos

Todo se guarda **solo en tu navegador** (localStorage): no hay servidor ni cuentas de usuario y tus datos no
salen del dispositivo. El historial de «Deshacer» también se guarda solo ahí (aparte) y se borra con
*Ajustes → Borrar todo*. Aunque la web sea pública, quien la abra solo ve **sus propios** datos (al principio, la
app vacía); nunca los tuyos. Los nombres de los titulares también se guardan solo ahí: no están en el código.

Además, la versión publicada incluye una **política de seguridad (CSP)** que solo deja a la app cargar sus
propios archivos e impide al navegador conectarse a cualquier otro servidor: aunque un código intentara enviar
tus datos fuera, el navegador lo bloquearía.

Como los datos solo están en el dispositivo, conviene descargar de vez en cuando una **copia de seguridad**
desde *Ajustes* (también sirve para pasar los datos a otro móvil u ordenador). Guárdala en un sitio privado:
no la subas a este repositorio.

## Instalar en el móvil

Abre la web de la app y:

- **iPhone / iPad (Safari)**: botón *Compartir* → *Añadir a pantalla de inicio*.
- **Android (Chrome)**: menú ⋮ → *Instalar aplicación*.

## Publicar en GitHub Pages

La app se publica en **https://mory8000.github.io/inversiones/** con el flujo `.github/workflows/deploy.yml`:
cada vez que se hace push a la rama `arena/fc3a1d34-inversiones` (o a `main`) comprueba los tipos, pasa los
tests, construye la app y la publica. No hace falta abrir ningún PR.

Configuración (una sola vez, en *Settings* del repositorio):

1. **Pages → Build and deployment → Source: GitHub Actions**.
2. **Environments → github-pages → Deployment branches and tags: No restriction** (por defecto GitHub solo
   deja publicar desde `main`; también valdría añadir una regla para la rama `arena/fc3a1d34-inversiones`).

> Con el plan gratuito de GitHub, Pages solo funciona si el repositorio es público. La web es pública
> (cualquiera con el enlace puede abrirla), pero cada persona solo ve los datos guardados en su propio navegador.

## Desarrollo

Necesitas Node.js 22 o superior.

```bash
npm install
npm run dev        # servidor de desarrollo en http://localhost:5173
npm test           # tests de los cálculos y del guardado de datos
npm run typecheck  # comprobación de tipos
npm run build      # versión de producción en dist/
npm run preview    # sirve la versión de producción
```

Tecnología: React 19, TypeScript, Vite, Tailwind CSS 4, Zustand (estado guardado en el navegador),
Recharts (gráficos), un diagrama de flujo propio en SVG y vite-plugin-pwa (instalable y sin conexión).

```
src/
├── lib/          Cálculos (finance.ts), saldo día a día (saldo.ts), diagrama de flujo (flow.ts), movimientos…
├── store/        Datos guardados (data.ts), deshacer (historial.ts, deshacer.ts), validación (sanitize.ts),
│                 estado de la interfaz (ui.ts)
├── components/   Gráficos, formularios, lista de movimientos y piezas de la interfaz
└── pages/        Inicio, Inversiones, Producto, Cuenta, Movimientos, Flujo y Ajustes
```
