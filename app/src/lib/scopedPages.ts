/** Collect a complete keyset scope. Never publish an accumulated prefix when
 * a later page fails. Callers provide a stable unique ordering and cursor. */
export async function completePages<T, C>(read: (cursor: C | null) => Promise<{ rows: T[]; next: C | null }>): Promise<T[]> {
  const rows: T[] = []
  let cursor: C | null = null
  do {
    const page = await read(cursor)
    rows.push(...page.rows)
    cursor = page.next
  } while (cursor !== null)
  return rows
}
export const SCOPE_PAGE_SIZE = 500
