/** Presentation of the uploader's existing step and included-row count. */
export type ImportProgress = { phase: 'upload' | 'review' | 'import' | 'done'; rows: number }
