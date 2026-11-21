interface Props<C> {
  label: string
  queue: { page: number; data: { next: C | null } | null; previous: () => void; next: (cursor: C) => void }
}
export function QueueNavigation<C>({ label, queue }: Props<C>) {
  if (!queue.data || (queue.page === 1 && !queue.data.next)) return null
  return <nav aria-label={label} className="flex items-center gap-3 text-sm">
    <button type="button" disabled={queue.page === 1} onClick={queue.previous}>Previous</button>
    <span>Page {queue.page}</span>
    <button type="button" disabled={!queue.data.next} onClick={() => queue.data?.next && queue.next(queue.data.next)}>Next</button>
  </nav>
}
