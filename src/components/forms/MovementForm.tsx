import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowRight, Ban, CalendarSync, Info, Plus, Trash2, TriangleAlert } from 'lucide-react'
import type { EntityKind, EntityRef, Movimiento, MovementType, Programada, Titular } from '../../types'
import { Sheet } from '../ui/Sheet'
import { Field, NumberInput, SelectInput, TextInput } from '../ui/Field'
import { Button } from '../ui/Button'
import { Switch } from '../ui/Switch'
import { EntityAvatar, MOVEMENT_ICONS } from '../ui/icons'
import { CROSS_META, MOVEMENT_META, MOVEMENT_TYPES, PRODUCT_META, PRODUCT_TYPES, inferMovementType } from '../../lib/meta'
import { useData } from '../../store/data'
import { useFinance } from '../../store/useFinance'
import { confirmDialog, openAccount, openProduct, toast, useUI, type MovementPreset } from '../../store/ui'
import { accion } from '../../store/deshacer'
import { anadirDinero, borrarMovimiento, etiquetaMovimiento } from '../../store/acciones'
import { fmtDate, fmtEUR, fmtNumberInput, parseNumber } from '../../lib/format'
import { isValidISODate, minDate, todayISO } from '../../lib/dates'
import { entityName, isConSaldo, isDePaso, isExterna, parseRefKey, refKey, type Lookup } from '../../lib/movements'
import { aplicarProgramadas, diaDe, fechasDebidas, movimientosDe, sincronizarProgramada } from '../../lib/programadas'
import { faltaDinero, saldoMinimoDesde, type FaltaDinero } from '../../lib/saldo'
import { MYINVESTOR, cuentaPrincipal } from '../../lib/titulares'
import { cn } from '../../lib/cn'

const NEW = '__new__'
/** «Cuenta externa (nueva)»: se crea al guardar (para «Añadir dinero» sin cuentas externas). */
const NEW_EXTERNA = '__new_externa__'
const NOMBRE_EXTERNA = 'Cuenta externa'

/** Explicación de lo que pasa con el dinero (dentro de un mismo titular). */
function explain(tipo: MovementType, o: string, d: string, oExterna: boolean, dExterna: boolean): string {
  switch (tipo) {
    case 'inversion':
      return oExterna ? `Sale dinero de «${o}» (cuenta externa) y se invierte en «${d}».` : `Sale dinero de «${o}» (baja su saldo) y se invierte en «${d}».`
    case 'reembolso':
      return dExterna ? `Recuperas dinero de «${o}» y va a «${d}» (cuenta externa).` : `Recuperas dinero de «${o}» y vuelve a «${d}» (sube su saldo).`
    case 'traspaso':
      return `Mueves dinero de «${o}» a «${d}» sin pasar por tu cuenta.`
    case 'transferencia':
      if (oExterna && !dExterna) return `Aportación: entra dinero de «${o}» (cuenta externa) en «${d}». Suma en el saldo de «${d}».`
      if (!oExterna && dExterna) return `Sacas dinero de «${o}» a «${d}» (cuenta externa). Baja el saldo de «${o}».`
      if (oExterna && dExterna) return `Mueves dinero entre cuentas externas: no cambia tu patrimonio.`
      return `Mueves dinero entre tus cuentas: de «${o}» a «${d}».`
  }
}

/**
 * Explicación cuando el dinero va de un titular a otro. `dePaso`: sale de una cuenta del principal
 * (MyInvestor) camino de otro titular, así que en lo del principal no cuenta (es un mero paso).
 */
function explainCross(o: string, d: string, from: Titular, to: Titular, destino: EntityRef, lookup: Lookup, dePaso: boolean): string {
  if (dePaso) {
    const pasa = `Sale de «${o}» (de ${from.nombre}) de paso`
    const noCuenta = `No cuenta como inversión para ${from.nombre}, pero el dinero sale igual de su cuenta`
    if (destino.kind === 'producto') return `${pasa} y se invierte en «${d}» (de ${to.nombre}). ${noCuenta}: cuenta solo para ${to.nombre}.`
    if (isConSaldo(lookup, destino)) return `${pasa} y llega a «${d}» (de ${to.nombre}). ${noCuenta}: cuenta solo para ${to.nombre}.`
    return `${pasa} y llega a «${d}» (de ${to.nombre}, cuenta externa). ${noCuenta}; para ${to.nombre} contará cuando lo invierta.`
  }
  if (destino.kind === 'producto') return `Sale dinero de «${o}» (de ${from.nombre}) y se invierte en «${d}» (de ${to.nombre}). Cuenta solo para ${to.nombre}, no para ${from.nombre}.`
  if (isConSaldo(lookup, destino)) return `Pasa dinero de «${o}» (de ${from.nombre}) a «${d}» (de ${to.nombre}). Cuenta solo para ${to.nombre}, no para ${from.nombre}.`
  return `Pasa dinero de «${o}» (de ${from.nombre}) a «${d}» (de ${to.nombre}, cuenta externa). No cuenta para ${from.nombre}; para ${to.nombre} contará cuando lo invierta.`
}

const dayLabel = (iso: string) => (isValidISODate(iso) ? `el día ${diaDe({ inicio: iso })}` : 'el mismo día')

export function MovementForm({
  modalId,
  movementId,
  programadaId,
  preset,
}: {
  modalId: string
  movementId?: string
  programadaId?: string
  preset?: MovementPreset
}) {
  const close = useUI((s) => s.close)
  const { ws, ds, positions, accounts, lookup, today, owner } = useFinance()
  const hidden = useData((s) => s.hideAmounts)
  const addCuenta = useData((s) => s.addCuenta)
  const addMovimiento = useData((s) => s.addMovimiento)
  const updateMovimiento = useData((s) => s.updateMovimiento)
  const addProgramada = useData((s) => s.addProgramada)
  const updateProgramada = useData((s) => s.updateProgramada)
  const removeProgramada = useData((s) => s.removeProgramada)
  const existing = movementId ? ws.movimientos.find((m) => m.id === movementId) : undefined
  const prog = programadaId ? ds.programadas.find((p) => p.id === programadaId) : undefined
  /** Si este movimiento lo apuntó una transferencia mensual. */
  const parent = existing?.programadaId ? ds.programadas.find((p) => p.id === existing.programadaId) : undefined
  /** La ventana donde se cambia una transferencia mensual: la de su cuenta con saldo o, si no pasa por ninguna, la principal. */
  const ventanaDeLaMensual = (x: Programada): string => {
    const ref = [x.origen, x.destino].find((r) => isConSaldo(lookup, r))
    return ref ? entityName(lookup, ref) : (cuentaPrincipal(ds.cuentas, ds.titulares[0].id)?.nombre ?? MYINVESTOR)
  }
  const multi = ds.titulares.length > 1

  const isNew = !existing && !prog
  /** «Añadir dinero»: titular para el que se ofrece crear su primera cuenta externa. */
  const externaNuevaT = isNew ? preset?.externaNueva : undefined
  const susExternas = externaNuevaT ? ws.cuentas.filter((c) => c.titularId === externaNuevaT && c.externa) : []
  const ofrecerExternaNueva = !!externaNuevaT && susExternas.length === 0

  const startOrigen = existing?.origen ?? prog?.origen ?? preset?.origen ?? (susExternas[0] ? { kind: 'cuenta' as const, id: susExternas[0].id } : undefined)
  const startDestino = existing?.destino ?? prog?.destino ?? preset?.destino
  const initialTipo: MovementType =
    existing?.tipo ?? (startOrigen && startDestino ? inferMovementType(startOrigen.kind, startDestino.kind) : (preset?.tipo ?? 'inversion'))

  const [tipo, setTipo] = useState<MovementType>(initialTipo)
  const [origen, setOrigen] = useState(startOrigen ? refKey(startOrigen) : ofrecerExternaNueva ? NEW_EXTERNA : '')
  const [destino, setDestino] = useState(startDestino ? refKey(startDestino) : '')
  const startImporte = existing?.importe ?? prog?.importe
  const [importe, setImporte] = useState(startImporte ? fmtNumberInput(startImporte, 'fixed') : '')
  const [fecha, setFecha] = useState(existing?.fecha ?? prog?.inicio ?? today)
  const [concepto, setConcepto] = useState(existing?.concepto ?? prog?.concepto ?? preset?.concepto ?? '')
  const [repetir, setRepetir] = useState(!!prog || (!existing && !!preset?.repetir))
  const [fin, setFin] = useState(prog?.fin ?? '')
  const [submitted, setSubmitted] = useState(false)

  const meta = MOVEMENT_META[tipo]
  const nuevaExterna = origen === NEW_EXTERNA && !!externaNuevaT
  const origenRef = parseRefKey(origen)
  const destinoRef = parseRefKey(destino)
  const amount = parseNumber(importe)
  const fromT = nuevaExterna ? lookup.titulares.get(externaNuevaT) : origenRef ? lookup.titulares.get(owner(origenRef) ?? '') : undefined
  const toT = destinoRef ? lookup.titulares.get(owner(destinoRef) ?? '') : undefined
  const cross = !!fromT && !!toT && fromT.id !== toT.id
  /**
   * Dinero desviado: va de una cuenta del principal (MyInvestor o una externa suya) hacia otro
   * titular (p. ej. al «Fondo ahorro»). No cuenta en lo del principal: ni en la cuenta de la que
   * sale (no entra ni sale), ni como movimiento ni como inversión suya.
   */
  const vaDePaso = !nuevaExterna && !!origenRef && !!destinoRef && isDePaso(lookup, { origen: origenRef, destino: destinoRef })

  const changeTipo = (t: MovementType) => {
    if (t === tipo) return
    const m = MOVEMENT_META[t]
    let o: EntityRef | null = origenRef
    let d: EntityRef | null = destinoRef
    // Si el nuevo tipo es el inverso (p. ej. inversión → reembolso), se intercambian.
    if (o && d && o.kind !== d.kind && o.kind === m.to && d.kind === m.from) [o, d] = [d, o]
    setOrigen(o && o.kind === m.from ? refKey(o) : '')
    setDestino(d && d.kind === m.to ? refKey(d) : '')
    setTipo(t)
  }

  const errors = {
    origen: !origenRef && !nuevaExterna ? 'Elige de dónde sale el dinero' : null,
    destino: !destinoRef ? 'Elige a dónde va el dinero' : origen === destino ? 'El origen y el destino no pueden ser el mismo' : null,
    importe: amount === null ? 'Escribe el importe' : amount <= 0 ? 'El importe tiene que ser mayor que 0' : null,
    fecha: !isValidISODate(fecha) ? 'Escribe una fecha válida' : null,
    fin: repetir && fin && (!isValidISODate(fin) || fin < fecha) ? 'Tiene que ser posterior a la primera fecha' : null,
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const err = (k: keyof typeof errors) => (submitted ? errors[k] : null)

  // Aviso si se saca más dinero del que hay en un producto (puede ser correcto: ganancias, intereses…).
  let saldoProducto: number | null = null
  if (origenRef?.kind === 'producto') {
    const pos = positions.get(origenRef.id)
    if (pos) saldoProducto = pos.saldo + (existing && existing.origen.kind === 'producto' && existing.origen.id === origenRef.id ? existing.importe : 0)
  }
  const exceedsProducto = !repetir && saldoProducto !== null && amount !== null && amount > Math.max(0, saldoProducto) + 0.005

  // ── ¿Hay dinero en la cuenta con saldo (MyInvestor) de la que sale? ──────
  // No se puede sacar más de lo que hay: ni ese día ni después (si hay movimientos posteriores).
  // El saldo es el real: el dinero que se desvía a otro titular también sale de la cuenta, así que
  // se comprueba igual que cualquier otra salida (si falta, es que falta apuntar de dónde vino).
  const origenConSaldo = !!origenRef && isConSaldo(lookup, origenRef)
  const sinEste = useMemo(() => (existing ? ws.movimientos.filter((m) => m.id !== existing.id) : ws.movimientos), [ws.movimientos, existing])
  /** Lo que hay disponible en la cuenta de origen en la fecha elegida (sin contar este movimiento). */
  const disponible = origenConSaldo && origenRef && isValidISODate(fecha) ? Math.max(0, saldoMinimoDesde(sinEste, origenRef.id, fecha)) : null
  const borrador: Movimiento | null =
    origenRef && destinoRef && amount !== null && amount > 0 && isValidISODate(fecha) && origen !== destino
      ? {
          id: existing?.id ?? '__nuevo__',
          tipo: inferMovementType(origenRef.kind, destinoRef.kind),
          fecha,
          origen: origenRef,
          destino: destinoRef,
          importe: amount,
          concepto,
          createdAt: existing?.createdAt ?? '9999',
          updatedAt: '',
        }
      : null
  const desde = existing ? minDate(existing.fecha, fecha) : fecha
  const despues = borrador ? [...sinEste, borrador] : null
  /** Movimiento normal: falta dinero en la cuenta de origen. */
  const sinSaldo: FaltaDinero | null =
    !repetir && despues && origenConSaldo && origenRef ? faltaDinero(ws.movimientos, despues, origenRef.id, desde, { sinElMovimiento: sinEste }) : null
  /** Al cambiar un movimiento, otras cuentas con saldo que se quedarían en negativo (p. ej. si se baja dinero añadido que ya se ha invertido). */
  const avisos: FaltaDinero[] = []
  if (!repetir && existing && despues) {
    const afectadas = new Set<string>()
    for (const r of [existing.origen, existing.destino, destinoRef]) if (r && isConSaldo(lookup, r)) afectadas.add(r.id)
    if (origenConSaldo && origenRef) afectadas.delete(origenRef.id)
    for (const id of afectadas) {
      const f = faltaDinero(ws.movimientos, despues, id, desde)
      if (f) avisos.push(f)
    }
  }
  /** Transferencia mensual: ¿hay dinero para las que tocan hasta hoy? */
  const sinSaldoMensual = useMemo((): FaltaDinero | null => {
    if (!repetir || !origenConSaldo || !origenRef || !destinoRef || amount === null || amount <= 0 || !isValidISODate(fecha) || origen === destino) return null
    if (fin && (!isValidISODate(fin) || fin < fecha)) return null
    const data = { origen: origenRef, destino: destinoRef, importe: amount, inicio: fecha, fin: fin || null, concepto }
    const draft: Programada = prog ? { ...prog, ...data } : { id: '__nueva__', ...data, excluidos: [], createdAt: '', updatedAt: '' }
    const simulado = prog
      ? sincronizarProgramada({ ...ds, programadas: ds.programadas.map((x) => (x.id === prog.id ? draft : x)) }, draft, today)
      : aplicarProgramadas({ ...ds, programadas: [...ds.programadas, draft] }, today)
    return faltaDinero(ds.movimientos, simulado.movimientos, origenRef.id, prog ? minDate(prog.inicio, fecha) : fecha)
    // origenRef y destinoRef salen de origen y destino.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repetir, origenConSaldo, amount, fecha, fin, origen, destino, concepto, prog, ds, today])
  const bloqueado = !!sinSaldo || !!sinSaldoMensual

  // Transferencia mensual: cuántas se apuntan ya (desde la primera fecha hasta hoy).
  const debidas = repetir && isValidISODate(fecha) ? fechasDebidas({ inicio: fecha, fin: fin && isValidISODate(fin) ? fin : null }, today) : []
  const yaApuntadas = prog ? movimientosDe(ds, prog.id).length : 0

  const save = () => {
    setSubmitted(true)
    if (hasErrors || (!origenRef && !nuevaExterna) || !destinoRef || amount === null) return
    if (bloqueado && origenRef) {
      toast(`No hay suficiente dinero en «${entityName(lookup, origenRef)}»`, 'error')
      document.querySelector('[data-sin-saldo]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const imp = hidden ? '' : ` ${fmtEUR(amount)}`
    const dNombre = entityName(lookup, destinoRef)
    if (repetir) {
      const etiqueta = `${prog ? 'Cambiar transferencia mensual' : 'Transferencia mensual'}:${imp} al mes a «${dNombre}»`
      accion(
        etiqueta,
        () => {
          const from = crearOrigen()
          if (!from) return
          const data = { origen: from, destino: destinoRef, importe: amount, inicio: fecha, fin: fin || null, concepto }
          if (prog) updateProgramada(prog.id, data)
          else addProgramada(data)
        },
        prog
          ? 'Transferencia mensual actualizada'
          : debidas.length
            ? `Transferencia mensual guardada: ${debidas.length} apuntada${debidas.length === 1 ? '' : 's'} hasta hoy`
            : 'Transferencia mensual guardada',
      )
    } else {
      const etiqueta = nuevaExterna
        ? `Añadir dinero:${imp} a «${dNombre}»`
        : origenRef
          ? `${existing ? 'Cambiar movimiento: ' : ''}${etiquetaMovimiento(lookup, { origen: origenRef, destino: destinoRef, importe: amount }, hidden)}`
          : 'Movimiento'
      accion(
        etiqueta,
        () => {
          const from = crearOrigen()
          if (!from) return
          const data = { fecha, origen: from, destino: destinoRef, importe: amount, concepto }
          if (existing) updateMovimiento(existing.id, data)
          else addMovimiento(data)
        },
        existing ? 'Movimiento actualizado' : 'Movimiento guardado',
      )
    }
    close(modalId)
  }

  /** El origen elegido o, para «Añadir dinero» sin cuentas externas, la cuenta externa que se crea ahora. */
  const crearOrigen = (): EntityRef | null => {
    if (nuevaExterna && externaNuevaT) {
      const id = addCuenta({ titularId: externaNuevaT, nombre: NOMBRE_EXTERNA, entidad: '', iban: '', color: '#64748B', notas: '', externa: true })
      return { kind: 'cuenta', id }
    }
    return origenRef
  }

  const remove = async () => {
    if (prog) {
      const n = movimientosDe(ds, prog.id).length
      const ok = await confirmDialog({
        title: '¿Eliminar la transferencia mensual?',
        message:
          (n > 0
            ? `Dejará de apuntarse cada mes y se borrarán también las ${n} transferencia${n === 1 ? '' : 's'} ya apuntada${n === 1 ? '' : 's'}. Si solo quieres que no siga, pon una fecha en «Hasta».`
            : 'Dejará de apuntarse cada mes.') + ' Si te equivocas, pulsa «Deshacer».',
        confirmLabel: 'Eliminar',
        danger: true,
      })
      if (ok) {
        accion(
          `Eliminar transferencia mensual:${hidden ? '' : ` ${fmtEUR(prog.importe)}`} al mes a «${entityName(lookup, prog.destino)}»`,
          () => removeProgramada(prog.id),
          'Transferencia mensual eliminada',
        )
        close(modalId)
      }
      return
    }
    if (!existing) return
    if (await borrarMovimiento(ds, existing)) close(modalId)
  }

  /** Titular por defecto para lo que se cree desde aquí. */
  const defaultTitular = (side: 'origen' | 'destino') => {
    const presetId = side === 'origen' ? preset?.origenTitularId : preset?.destinoTitularId
    if (presetId) return presetId
    const other = side === 'origen' ? destinoRef : origenRef
    return (other && owner(other)) || ds.titulares[0].id
  }

  const onSelect = (kind: EntityKind, side: 'origen' | 'destino', value: string, set: (v: string) => void) => {
    if (value !== NEW) return set(value)
    const presetTitularId = defaultTitular(side)
    // Tipo de cuenta que se propone al crearla: de dónde viene una aportación → externa;
    // a dónde llega el dinero de otro titular → con saldo (para que cuente para él).
    const other = side === 'origen' ? destinoRef : origenRef
    const otherOwner = other ? owner(other) : undefined
    let presetExterna: boolean | undefined
    if (side === 'origen' && tipo === 'transferencia' && destinoRef && isConSaldo(lookup, destinoRef)) presetExterna = true
    else if (side === 'destino' && otherOwner && otherOwner !== presetTitularId) presetExterna = false
    if (kind === 'cuenta') openAccount({ presetTitularId, presetExterna, onCreated: (id) => set(refKey({ kind: 'cuenta', id })) })
    else openProduct({ presetTitularId, onCreated: (id) => set(refKey({ kind: 'producto', id })) })
  }

  const options = (kind: EntityKind, exclude: string, side: 'origen' | 'destino') => {
    if (kind === 'cuenta') {
      return (
        <>
          {ds.titulares.map((t) => {
            // Primero las cuentas con saldo (MyInvestor), luego las externas.
            const list = [...ws.cuentas.filter((c) => c.titularId === t.id && !c.externa), ...ws.cuentas.filter((c) => c.titularId === t.id && c.externa)]
            const conNueva = side === 'origen' && ofrecerExternaNueva && t.id === externaNuevaT
            if (!list.length && !conNueva) return null
            const opts = list.map((c) => {
              const k = refKey({ kind: 'cuenta', id: c.id })
              const st = accounts.get(c.id)
              const extra = c.externa ? ` · ${c.entidad ? `${c.entidad} · ` : ''}externa` : st && !hidden ? ` (saldo ${fmtEUR(st.saldo)})` : ''
              return (
                <option key={c.id} value={k} disabled={k === exclude}>
                  {c.nombre}
                  {extra}
                </option>
              )
            })
            if (conNueva) {
              opts.push(
                <option key={NEW_EXTERNA} value={NEW_EXTERNA}>
                  {NOMBRE_EXTERNA} (nueva)
                </option>,
              )
            }
            return multi ? (
              <optgroup key={t.id} label={`Cuentas de ${t.nombre}`}>
                {opts}
              </optgroup>
            ) : (
              opts
            )
          })}
          <option value={NEW}>＋ Crear una cuenta nueva…</option>
        </>
      )
    }
    return (
      <>
        {ds.titulares.flatMap((t) =>
          PRODUCT_TYPES.map((tp) => {
            const list = ws.productos.filter((p) => p.tipo === tp && p.titularId === t.id)
            if (!list.length) return null
            return (
              <optgroup key={`${t.id}-${tp}`} label={multi ? `${PRODUCT_META[tp].plural} de ${t.nombre}` : PRODUCT_META[tp].plural}>
                {list.map((p) => {
                  const k = refKey({ kind: 'producto', id: p.id })
                  const pos = positions.get(p.id)
                  const saldo = pos && pos.saldo > 0.005 && !hidden ? ` (${fmtEUR(pos.saldo)})` : ''
                  return (
                    <option key={p.id} value={k} disabled={k === exclude}>
                      {p.nombre}
                      {saldo}
                    </option>
                  )
                })}
              </optgroup>
            )
          }),
        )}
        <option value={NEW}>＋ Crear un producto nuevo…</option>
      </>
    )
  }

  const placeholder = (kind: EntityKind) => (kind === 'cuenta' ? 'Elige una cuenta…' : 'Elige un producto…')
  const oName = nuevaExterna ? NOMBRE_EXTERNA : origenRef ? entityName(lookup, origenRef) : null
  const dName = destinoRef ? entityName(lookup, destinoRef) : null
  const avatarFor = (ref: EntityRef | null) =>
    ref ? (
      <EntityAvatar
        cuenta={ref.kind === 'cuenta' ? lookup.cuentas.get(ref.id) : undefined}
        producto={ref.kind === 'producto' ? lookup.productos.get(ref.id) : undefined}
        size="sm"
      />
    ) : (
      <span className="size-8 shrink-0 rounded-lg border-2 border-dashed border-slate-200" />
    )
  const summary = cross ? CROSS_META : meta
  const title = prog
    ? 'Editar transferencia mensual'
    : isNew && preset?.titulo
      ? preset.titulo
      : repetir
        ? 'Nueva transferencia mensual'
        : existing
          ? 'Editar movimiento'
          : 'Nuevo movimiento'
  const oExterna = nuevaExterna || (!!origenRef && isExterna(lookup, origenRef))
  const dExterna = !!destinoRef && isExterna(lookup, destinoRef)
  const showTipo = !(isNew && preset?.fijo)

  return (
    <Sheet
      title={title}
      subtitle={repetir ? 'Se apunta sola cada mes: indica de dónde sale el dinero y a dónde va' : 'Indica de dónde sale el dinero y a dónde va'}
      onClose={() => close(modalId)}
      footer={
        <div className="flex items-center gap-2">
          {(existing || prog) && (
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={remove}
              className="text-rose-600 hover:bg-rose-50"
              aria-label={prog ? 'Eliminar transferencia mensual' : 'Eliminar movimiento'}
            />
          )}
          <div className="flex-1" />
          {/* En pantallas muy estrechas el texto pasa a dos líneas en vez de salirse. */}
          <Button variant="secondary" wrap className="min-w-0" onClick={() => close(modalId)}>
            Cancelar
          </Button>
          <Button onClick={save} wrap className={bloqueado ? 'min-w-0 opacity-50' : 'min-w-0'} aria-disabled={bloqueado || undefined}>
            {existing || prog ? 'Guardar cambios' : repetir ? 'Guardar transferencia' : 'Guardar movimiento'}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {parent && (
          <div className="flex gap-2.5 rounded-xl bg-fuchsia-50 p-3 text-sm text-fuchsia-900">
            <CalendarSync className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p>
                Lo apuntó sola la <strong>transferencia mensual</strong> ({fmtEUR(parent.importe)} {dayLabel(parent.inicio)} de cada mes). Si lo cambias aquí,
                solo cambia este mes.
              </p>
              {/* La transferencia mensual (todos los meses) solo se cambia en la ventana de su cuenta. */}
              <p className="mt-1.5 text-fuchsia-800">
                Para cambiarla todos los meses: en Inicio, «Abrir {ventanaDeLaMensual(parent)}» y «Editar».
              </p>
            </div>
          </div>
        )}

        {/* Tipo */}
        {showTipo && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">¿Qué quieres registrar?</legend>
          <div className="grid grid-cols-2 gap-2">
            {MOVEMENT_TYPES.map((t) => {
              const m = MOVEMENT_META[t]
              const Icon = MOVEMENT_ICONS[t]
              const active = t === tipo
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => changeTipo(t)}
                  aria-pressed={active}
                  className={cn(
                    'flex min-w-0 items-start gap-2.5 rounded-xl border p-3 text-left transition-all max-[359px]:flex-col max-[359px]:gap-1.5',
                    active ? 'border-transparent ring-2' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  )}
                  style={active ? ({ backgroundColor: m.soft, '--tw-ring-color': m.color } as CSSProperties) : undefined}
                >
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: active ? 'white' : m.soft, color: m.color }}>
                    <Icon className="size-4" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: active ? m.text : undefined }}>
                      {m.label}
                    </span>
                    <span className="block text-xs leading-snug text-slate-500">{m.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>
        )}

        {/* De → A */}
        <div className="rounded-2xl bg-slate-50 p-3.5 sm:p-4">
          <Field
            label={
              <span>
                <span className="mr-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">DE</span>
                {meta.from === 'cuenta' ? 'Cuenta de origen' : 'Producto de origen'}
              </span>
            }
            htmlFor="mov-origen"
            error={err('origen')}
            hint={
              [
                multi && fromT ? `De ${fromT.nombre}` : null,
                vaDePaso ? 'De paso: no cuenta como inversión suya (el dinero sale igual)' : null,
                disponible !== null && !hidden ? `Disponible: ${fmtEUR(disponible)}${fecha < today ? ` (el ${fmtDate(fecha)})` : ''}` : null,
                saldoProducto !== null && !hidden ? `Saldo actual: ${fmtEUR(saldoProducto)}` : null,
                nuevaExterna ? `Se creará la cuenta «${NOMBRE_EXTERNA}» (luego puedes cambiarle el nombre en Cuentas)` : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          >
            <SelectInput
              id="mov-origen"
              value={origen}
              invalid={!!err('origen')}
              onChange={(e) => onSelect(meta.from, 'origen', e.target.value, setOrigen)}
              data-autofocus
            >
              <option value="" disabled>
                {placeholder(meta.from)}
              </option>
              {options(meta.from, destino, 'origen')}
            </SelectInput>
          </Field>

          <div className="my-2 flex justify-center text-slate-400" aria-hidden>
            <span className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white">
              <ArrowDown className="size-4" />
            </span>
          </div>

          <Field
            label={
              <span>
                <span className="mr-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">A</span>
                {meta.to === 'cuenta' ? 'Cuenta de destino' : 'Producto de destino'}
              </span>
            }
            htmlFor="mov-destino"
            error={err('destino')}
            hint={multi && toT ? `De ${toT.nombre}` : undefined}
          >
            <SelectInput
              id="mov-destino"
              value={destino}
              invalid={!!err('destino')}
              onChange={(e) => onSelect(meta.to, 'destino', e.target.value, setDestino)}
            >
              <option value="" disabled>
                {placeholder(meta.to)}
              </option>
              {options(meta.to, origen, 'destino')}
            </SelectInput>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.4fr_1fr]">
          <Field label={repetir ? 'Importe cada mes' : 'Importe'} htmlFor="mov-importe" error={err('importe')}>
            <NumberInput
              id="mov-importe"
              big
              suffix="€"
              placeholder="0,00"
              value={importe}
              invalid={!!err('importe')}
              onChange={(e) => setImporte(e.target.value)}
              onBlur={() => {
                const n = parseNumber(importe)
                if (n !== null && n > 0) setImporte(fmtNumberInput(n, 'fixed'))
              }}
            />
          </Field>
          <Field label={repetir ? 'Primera fecha' : 'Fecha'} htmlFor="mov-fecha" error={err('fecha')}>
            <TextInput id="mov-fecha" type="date" className="h-14" value={fecha} max="2100-12-31" onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        {bloqueado && origenRef && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800" role="alert" data-sin-saldo>
            <p className="flex items-center gap-2 font-semibold">
              <Ban className="size-4 shrink-0" /> No hay suficiente dinero en «{oName}»
            </p>
            {sinSaldo ? (
              <p className="mt-1">
                Hay {hidden ? '•••••• €' : fmtEUR(disponible ?? sinSaldo.disponible)} disponibles{fecha < today ? ` (el ${fmtDate(fecha)})` : ''} y quieres{' '}
                {destinoRef?.kind === 'producto' ? 'aportar' : destinoRef && isExterna(lookup, destinoRef) ? 'sacar' : 'enviar'} {hidden ? '•••••• €' : fmtEUR(amount ?? 0)}: faltan{' '}
                <strong>{hidden ? '•••••• €' : fmtEUR(sinSaldo.falta)}</strong>.
              </p>
            ) : (
              sinSaldoMensual && (
                <p className="mt-1">
                  Para apuntar {debidas.length === 1 ? 'la transferencia que toca' : `las ${debidas.length} transferencias que tocan`} hasta hoy (desde el{' '}
                  {fmtDate(fecha)}) faltan <strong>{hidden ? '•••••• €' : fmtEUR(sinSaldoMensual.falta)}</strong> en «{oName}»: en esas fechas no había bastante
                  dinero.
                </p>
              )
            )}
            <p className="mt-1">No se puede aportar más dinero del que hay. Añade dinero primero desde tu banco o pon un importe menor.</p>
            <Button size="sm" icon={Plus} wrap className="mt-2.5" onClick={() => anadirDinero(ds, origenRef.id)}>
              Añadir dinero a «{oName}»
            </Button>
          </div>
        )}

        {/* Repetir cada mes */}
        {!existing && (
          <div className={cn('rounded-2xl border p-3.5 sm:p-4', repetir ? 'border-fuchsia-200 bg-fuchsia-50/60' : 'border-slate-200')}>
            {!prog && (
              <div className="flex items-start justify-between gap-3">
                <label htmlFor="mov-repetir" className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <CalendarSync className="size-4 text-fuchsia-600" /> Repetir cada mes
                  </span>
                  <span className="mt-0.5 block text-[13px] text-slate-500">La app lo apuntará sola cada mes, el mismo día (p. ej., una transferencia mensual).</span>
                </label>
                <Switch id="mov-repetir" checked={repetir} onChange={setRepetir} label="Repetir cada mes" />
              </div>
            )}
            {repetir && (
              <div className={cn(!prog && 'mt-4')}>
                <Field label="Hasta" htmlFor="mov-fin" optional error={err('fin')} hint="Déjalo vacío si no tiene fecha de fin">
                  <TextInput id="mov-fin" type="date" value={fin} min={fecha} max="2100-12-31" onChange={(e) => setFin(e.target.value)} />
                </Field>
                <p className="mt-3 text-[13px] text-fuchsia-900">
                  {isValidISODate(fecha) ? (
                    <>
                      Se apuntará <strong>{amount && amount > 0 ? (hidden ? '•••••• €' : fmtEUR(amount)) : 'el importe'}</strong> {dayLabel(fecha)} de cada mes, desde el{' '}
                      {fmtDate(fecha)}
                      {fin && isValidISODate(fin) ? ` hasta el ${fmtDate(fin)}` : ''}.{' '}
                      {prog
                        ? `Ya hay ${yaApuntadas} apuntada${yaApuntadas === 1 ? '' : 's'}; las que no hayas cambiado a mano se actualizarán.`
                        : debidas.length > 0
                          ? `Hasta hoy son ${debidas.length}: se apuntan ya.`
                          : 'La primera se apuntará cuando llegue la fecha.'}
                    </>
                  ) : (
                    'Elige la primera fecha.'
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        <Field label="Concepto" htmlFor="mov-concepto" optional>
          <TextInput
            id="mov-concepto"
            placeholder={repetir ? 'Ej.: Transferencia mensual' : 'Ej.: Aportación mensual, vencimiento…'}
            value={concepto}
            maxLength={120}
            onChange={(e) => setConcepto(e.target.value)}
          />
        </Field>

        {exceedsProducto && saldoProducto !== null && (
          <div className="flex gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              El importe supera el saldo actual de «{oName}» ({hidden ? 'oculto' : fmtEUR(saldoProducto)}). Puede ser correcto si incluye ganancias o intereses.
            </span>
          </div>
        )}
        {avisos.map((a) => (
          <div key={a.cuentaId} className="flex gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800" data-aviso-saldo>
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Con este cambio, «{entityName(lookup, { kind: 'cuenta', id: a.cuentaId })}» se quedará en negativo ({hidden ? '•••••• €' : fmtEUR(a.saldoMinimo)}), porque
              ese dinero ya se ha usado. Se puede guardar igualmente: su saldo será el real.
            </span>
          </div>
        ))}
        {!repetir && fecha > todayISO() && isValidISODate(fecha) && (
          <div className="flex gap-2.5 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>La fecha es futura. El movimiento se tendrá en cuenta igualmente en los saldos.</span>
          </div>
        )}

        {/* Resumen visual */}
        <div className="rounded-2xl border p-4" style={{ borderColor: `${summary.color}33`, backgroundColor: `${summary.soft}66` }}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: summary.text }}>
              {cross ? `${CROSS_META.label}: de ${fromT!.nombre} a ${toT!.nombre}` : meta.label}
              {repetir ? ' · cada mes' : ''}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums">
              {amount && amount > 0 ? (hidden ? '•••••• €' : fmtEUR(amount)) : '— €'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {avatarFor(origenRef)}
              <span className={cn('truncate text-sm font-medium', oName ? 'text-slate-800' : 'text-slate-400')}>{oName ?? 'Origen'}</span>
            </div>
            <ArrowRight className="size-5 shrink-0" style={{ color: summary.color }} />
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
              <span className={cn('truncate text-sm font-medium', dName ? 'text-slate-800' : 'text-slate-400')}>{dName ?? 'Destino'}</span>
              {avatarFor(destinoRef)}
            </div>
          </div>
          {oName && dName && (
            <p className="mt-3 text-[13px] text-slate-600">
              {cross && destinoRef ? explainCross(oName, dName, fromT!, toT!, destinoRef, lookup, vaDePaso) : explain(tipo, oName, dName, oExterna, dExterna)}
            </p>
          )}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
