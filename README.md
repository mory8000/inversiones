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
  <img src="docs/movil-inicio.jpg" width="200" alt="Inicio en el móvil: la tarjeta del titular principal, con su cuenta MyInvestor y el botón Abrir MyInvestor">
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
  - **Total**: debajo de la tarjeta del «Fondo ahorro», una ventana con el total de los dos sumado (una sola
    línea: «Total 37.998,09 €»), con el mismo fondo azul y la misma caja (icono, nombre e importe) que la ventana
    de la cuenta **MyInvestor**, con el importe más grande para verlo de un vistazo. Las tarjetas siguen con sus cifras por separado. En el ordenador, la tarjeta del
    «Fondo ahorro» y la del total juntas ocupan lo mismo que la del titular principal.
  - En la del principal está su cuenta **MyInvestor** (con su saldo) y el botón **«Abrir MyInvestor»**.
  - **Ventana de MyInvestor** (al abrirla): su **saldo real** (positivo o negativo), **Añadir dinero** (desde una
    cuenta externa), **Invertir**, **Programar transferencia mensual**, **Sacar dinero**, sus transferencias
    mensuales (con **Editar**: es el único sitio donde se cambian) y el **dinero añadido desde bancos externos**,
    cada movimiento con sus botones **Editar** y **Borrar**. Lo que va **de paso** camino del «Fondo ahorro» **no
    cuenta como inversión suya** (ni lo que entra ni lo que sale) y no figura en su lista de movimientos (solo la
    transferencia mensual, para poder cambiarla), **pero el dinero sí sale de ella**: el saldo que se ve es el real.
  - **Ventanillas**: al tocar una se abre con su saldo, su **% de rentabilidad** (o su **interés**, en los
    depósitos) con el botón para cambiarlo, y con lo que se puede hacer: **Aportar**, **Retirar** (reembolso),
    **Traspasar**, **Programar transferencia mensual** y ver sus movimientos (con **Editar** y **Borrar**).
  - **Ordenar**: pon las ventanillas en el orden que quieras, arrastrándolas o con «Antes» / «Después». El orden
    se guarda y se usa también en *Inversiones*.
  - Debajo: la evolución de cada titular (las líneas empiezan a marcar **ayer**: lo anterior no se dibuja, y
    desde ahí cuentan lo que se aporta, lo que se saca y lo que ganan o pierdan las inversiones), dónde está el
    dinero de cada uno, el diagrama del flujo del dinero, el resumen por tipo de cada titular (como el Excel),
    los últimos movimientos y las cuentas.
- **Poner los valores de hoy**: en Inicio, el botón **«Valores»** (y en Ajustes, la fila «Poner los valores de
  hoy») abre una ventana con **una casilla por inversión**: se escribe lo que vale hoy cada fondo, cartera o
  depósito, tal como se ve en la app del banco, y al guardar se actualizan todos de una vez (quedan como su
  **valor de mercado**, con la fecha de hoy; lo que ya hubiera apuntado ese mismo día se sustituye). Abajo se ve
  en vivo cómo quedan las tarjetas de Inicio (cada titular y el total), para poder compararlo con el banco y
  cuadrarlo. Todo se deshace con un solo «Deshacer».
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
  transferencia mensual que empieza en el pasado, se comprueba que haya dinero para las que ya tocan. Vale
  también para lo que va **de paso** a otro titular (como la transferencia mensual al «Fondo ahorro»): sale de la
  cuenta, así que se comprueba igual.
- **Movimientos**: todos los movimientos de todos los titulares, con su origen (**De**) y destino (**A**) y de quién
  es cada uno, agrupados por meses. Filtros por titular, tipo, cuenta o producto, tipo de producto y periodo;
  buscador; y exportación a Excel (CSV).
- **Descargar copia en Excel** (en *Ajustes*): un libro VIVO, no una foto. Todo gira alrededor de la hoja
  **Movimientos**, que es una tabla de Excel donde registras cada operación: eliges el **Tipo** en una lista
  desplegable (**Compra**, **Venta**, **Ingreso**, **Gasto**, **Traspaso** o **Ahorro** —lo que se va al otro
  titular—), el **Titular**, **De** y **A** (también desplegables) y el importe. Al escribir un movimiento se
  actualizan solos **Cuentas** (entradas, salidas y saldo real), **Inversiones** (invertido, reembolso,
  traspaso, capital, % y saldo: escribe el % de hoy y el saldo se recalcula) y el panel de **Inicio**
  (patrimonio, invertido, en cuentas, capital, ganancia, rentabilidad y aportado), todo con SUMIFS y BUSCARV
  entre hojas. Trae 30 filas vacías con los desplegables listos para seguir registrando.
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
  qué cuenta y a qué producto o cuenta), y la app la apunta sola cada mes. Para cambiarla (importe, día, hasta
  cuándo) o eliminarla: **«Abrir MyInvestor» → «Editar»** (es el único sitio; en las tarjetas de Inicio no sale).
  Un mes concreto se puede cambiar o borrar sin tocar los demás.
- **El dinero cuenta para quien lo recibe**: si sale de la cuenta del titular 1 y entra en un producto o en una
  cuenta con saldo del titular 2, cuenta solo para el titular 2, no para el titular 1.
- **Dinero de paso** (p. ej. la transferencia mensual al «Fondo ahorro»): lo que se va a otro titular **no cuenta
  como inversión para quien lo manda** (ni en su patrimonio ni en su aportado, tampoco lo que ese dinero gane o
  pierda después), sino solo para quien lo recibe. Pero **el dinero sale de su bolsillo**: de su cuenta con saldo
  (MyInvestor), aunque la transferencia esté puesta en una cuenta externa suya (p. ej. la «Cuenta Nómina»). Así un
  ingreso de 1.000 € deja 547 € en MyInvestor cuando ese mes se van 453 € al «Fondo ahorro», y el saldo de
  MyInvestor es el real (puede quedar en negativo si ha salido más de lo que entró). Si el dinero entró de fuera y
  se fue, no engorda el «Aportado». En la lista de MyInvestor no sale (solo la
  transferencia mensual, para poder cambiarla); en «Todos» los movimientos sale como «Aportación a Fondo ahorro» y
  en el flujo del dinero como «Aportaciones · Fondo ahorro». Se aplica a
  todo, **también a los meses ya apuntados**.
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
Si sale de una cuenta del titular principal (MyInvestor o una externa), es **de paso**: no cuenta como inversión
para él (ni en su lista de movimientos ni en su aportado), pero el dinero sí sale de su cuenta con saldo
(MyInvestor), aunque la transferencia esté puesta en una externa. En «Todos» se ve como **«Aportación a …»** de
quien lo recibe.

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
Saldo de una cuenta con saldo = lo que ha entrado − lo que ha salido − lo que se ha ido de paso
Patrimonio = saldo de sus productos + saldo de sus cuentas con saldo (MyInvestor)
Aportado   = lo que ha entrado desde fuera (cuentas externas u otros titulares) − lo que se ha ido de paso
```

El dinero que va **de paso** a otro titular (p. ej. al «Fondo ahorro») no cuenta como aportado suyo y tampoco
figura como entrada ni como salida de la cuenta, pero **sí baja el saldo de su cuenta con saldo** (MyInvestor): el
mismo importe se resta de las dos cifras. Si la transferencia está puesta en una cuenta externa suya (la «Cuenta
Nómina»), se paga igual con el dinero de MyInvestor. El saldo es siempre el real: puede quedar en negativo si ha
salido más de lo que entró. Ese dinero, y lo que gane o pierda después, cuenta solo para quien lo recibe. Como todo se calcula
desde el primer movimiento, vale también para lo que ya estaba apuntado.

Las cifras de cada titular van por separado: cada uno ve solo lo suyo. Solo la ventana **Total** (debajo del
«Fondo ahorro») suma el patrimonio de todos, tal como se ve en cada tarjeta (al céntimo):

```
Total = patrimonio del principal + patrimonio del «Fondo ahorro»
```

Si el saldo de MyInvestor queda en negativo (por ejemplo, al borrar dinero añadido que ya se había invertido, o
si una aportación mensual a una inversión suya llega sin dinero suficiente), se ve en rojo, resta en el
patrimonio y la app avisa de que falta apuntar de dónde vino el dinero («Añadir dinero», dentro de la ventana de
MyInvestor).

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
