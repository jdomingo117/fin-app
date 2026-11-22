import { BUDGET_ENABLED } from '../../lib/budgetWorkspace'

const sections = [
  { id: 'dashboard', name: 'Overview', subtitle: 'Your financial position', icon: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5' },
  { id: 'accounts', name: 'Accounts', subtitle: 'Balances and holdings', icon: 'M3 6h18v12H3zM3 10h18M7 15h4' },
  { id: 'income', name: 'Income', subtitle: 'Money coming in', icon: 'M4 19h16M7 14l5-5 3 3 5-6M16 6h4v4' },
  { id: 'expenses', name: 'Expenses', subtitle: 'Spending and recurring costs', icon: 'M6 7h12l-1 13H7zM9 8V6a3 3 0 0 1 6 0v2' },
  { id: 'budget', name: 'Budget', subtitle: 'Plan your spending', icon: 'M12 3v9h9M21 12a9 9 0 1 1-9-9' },
] as const

export type SectionId = (typeof sections)[number]['id']
export const enabledSections = sections.filter(({ id }) => id !== 'budget' || BUDGET_ENABLED)
