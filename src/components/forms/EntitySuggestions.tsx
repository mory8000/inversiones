import { useWorkspace } from '../../store/data'

export const ENTITY_LIST_ID = 'entidades-sugeridas'

const COMMON = [
  'MyInvestor',
  'Indexa Capital',
  'Finizens',
  'Openbank',
  'Trade Republic',
  'Renta 4',
  'BBVA',
  'Banco Santander',
  'CaixaBank',
  'ING',
  'Bankinter',
  'Banco Sabadell',
  'Abanca',
  'Unicaja',
  'Kutxabank',
  'Ibercaja',
  'EVO Banco',
  'Pibank',
  'Revolut',
  'N26',
]

/** Lista de sugerencias para el campo "Entidad". */
export function EntitySuggestions() {
  const ws = useWorkspace()
  const used = [...ws.cuentas.map((c) => c.entidad), ...ws.productos.map((p) => p.entidad)].filter(Boolean)
  const all = [...new Set([...used, ...COMMON])]
  return (
    <datalist id={ENTITY_LIST_ID}>
      {all.map((e) => (
        <option key={e} value={e} />
      ))}
    </datalist>
  )
}
