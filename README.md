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
  <img src="docs/movil-inicio.jpg" width="250" alt="Inicio en el móvil">
  <img src="docs/movil-movimientos.jpg" width="250" alt="Movimientos en el móvil">
  <img src="docs/movil-flujo.jpg" width="250" alt="Flujo del dinero en el móvil">
</p>

> Las capturas usan los **datos de ejemplo** (ficticios) que se pueden cargar desde la propia app.

## Qué puedes hacer

- **Inicio**: **todos los titulares a la vez**, sin tener que elegir: la tarjeta de cada uno (el primero es el
  principal) con su patrimonio, rentabilidad en € y %, capital invertido, lo aportado y lo reembolsado, y lo que ha
  enviado o recibido de otro titular. Debajo, la transferencia mensual, la evolución (una línea por titular), dónde
  está el dinero de cada uno, el diagrama del flujo del dinero, el resumen por tipo de cada titular (como el Excel),
  los últimos movimientos y las cuentas.
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
- **Detalle de cada cuenta**: cuánto ha salido hacia inversiones, cuánto ha vuelto y a qué productos.
- **Varios titulares, vistos a la vez**: la app empieza con «Titular 1» (el principal) y «Titular 2»; ponles
  nombre desde la propia app. Cada cuenta y cada producto es de un titular, cada titular tiene su color y sus
  cifras van siempre por separado (nunca se suman). Desde *Ajustes → Titulares* se puede añadir otro titular o
  elegir cuál es el principal (código y nombre, como en la cabecera del Excel).
- **Transferencia mensual**: por ejemplo, del titular 1 al titular 2. Se programa una vez (importe, día, desde
  qué cuenta y a qué producto o cuenta) y la app la apunta sola cada mes. Un mes concreto se puede cambiar o
  borrar sin tocar los demás.
- **Lo invertido cuenta para quien lo recibe**: si el dinero sale de la cuenta del titular 1 y entra en un
  producto del titular 2, cuenta como inversión del titular 2, no del titular 1.
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

Si el origen y el destino son de **titulares distintos**, el movimiento se ve como **«Entre titulares»**. Para
quien lo recibe en un producto es una inversión suya (una aportación); para quien lo envía, no.

## Cómo se calcula

Las mismas fórmulas que el Excel, para cada producto:

```
Invertido = aportado desde cuentas + traspasos recibidos
Capital   = Invertido − Reembolsado − Traspasos enviados
Saldo     = Capital × (1 + %)
€         = Saldo − Capital            (rentabilidad en euros)
```

El valor de cada producto se puede actualizar de dos formas (botón **Actualizar valor**):

- **Rentabilidad (%)**, como en el Excel: `Saldo = Capital × (1 + %)`.
- **Valor de mercado (€)**: el valor que ves en la app de tu banco. Los movimientos posteriores se suman o restan.

En los **depósitos** el interés se calcula solo con la TAE (interés simple): `capital × TAE × días / 365`,
desde la primera aportación hasta hoy o hasta el vencimiento.

Cuando sacas todo el dinero de un producto (por ejemplo, al vencer un depósito), queda como **cerrado** y su
resultado final es lo que has recuperado menos lo que invertiste.

## Tus datos

Todo se guarda **solo en tu navegador** (localStorage): no hay servidor ni cuentas de usuario y tus datos no
salen del dispositivo. Aunque la web sea pública, quien la abra solo ve **sus propios** datos (al principio, la
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
├── lib/          Cálculos (finance.ts), diagrama de flujo (flow.ts), movimientos, formatos, fechas…
├── store/        Datos guardados (data.ts), validación (sanitize.ts), estado de la interfaz (ui.ts)
├── components/   Gráficos, formularios, lista de movimientos y piezas de la interfaz
└── pages/        Inicio, Inversiones, Producto, Cuenta, Movimientos, Flujo y Ajustes
```
