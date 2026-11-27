import { BUDGET_ENABLED } from '../../lib/budgetWorkspace'

const sections = [
  { id: 'dashboard', name: 'Overview', subtitle: 'Your financial position', icon: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5' },
  { id: 'accounts', name: 'Accounts', subtitle: 'Balances and holdings', icon: 'M3 6h18v12H3zM3 10h18M7 15h4' },
  { id: 'income', name: 'Income', subtitle: 'Money coming in', icon: 'M4 19h16M7 14l5-5 3 3 5-6M16 6h4v4' },
  { id: 'expenses', name: 'Expenses', subtitle: 'Spending and recurring costs', icon: 'M6 7h12l-1 13H7zM9 8V6a3 3 0 0 1 6 0v2' },
  { id: 'budget', name: 'Budget', subtitle: 'Plan your spending', icon: 'M12 3v9h9M21 12a9 9 0 1 1-9-9' },
  { id: 'goals', name: 'Goals', subtitle: 'Targets you’re working toward', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z' },
  { id: 'bills', name: 'Bills', subtitle: 'Recurring costs coming up', icon: 'M5 5h14v15H5zM5 10h14M9 3v4m6-4v4' },
  { id: 'ingestion', name: 'Ingestion', subtitle: 'Import bank statements', icon: 'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4' },
] as const

export type SectionId = (typeof sections)[number]['id']
export type SectionTile = (typeof sections)[number]
export const enabledSections: readonly SectionTile[] = sections.filter(({ id }) => id !== 'budget' || BUDGET_ENABLED)

/** Home's rows, switched by the tab control above the tiles. Each row keeps its own selected tile. */
const rows = [
  { id: 'money', name: 'Money', sections: ['dashboard', 'accounts', 'income', 'expenses', 'budget'] },
  { id: 'plan', name: 'Plan', sections: ['goals', 'bills'] },
  { id: 'import', name: 'Import', sections: ['ingestion'] },
] as const satisfies readonly { id: string; name: string; sections: readonly SectionId[] }[]

export type HomeRowId = (typeof rows)[number]['id']
export type HomeRow = { id: HomeRowId; name: string; sections: readonly SectionTile[] }

export const homeRows: readonly HomeRow[] = rows.map(row => ({
  id: row.id, name: row.name,
  sections: enabledSections.filter(section => (row.sections as readonly SectionId[]).includes(section.id)),
}))

export function rowOf(id: SectionId): HomeRow {
  return homeRows.find(row => row.sections.some(section => section.id === id)) ?? homeRows[0]
}

/** Each row's first tile, the selection a row starts with. */
export const initialRowTiles = Object.fromEntries(homeRows.map(row => [row.id, row.sections[0].id])) as Record<HomeRowId, SectionId>
