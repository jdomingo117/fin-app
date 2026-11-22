import { dayLabel } from '../lib/period'
import { useView } from '../router'

/** Legacy views keep their existing display when mounted in Classic. */
export function useConsoleDayLabel() {
  const { theme } = useView()
  return (date: string | null | undefined) => date && theme === 'console' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? dayLabel(date) : date
}
