export type QuestionMode = 'byDate' | 'reachTarget'

export const dateLabel = (date: string) => new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
