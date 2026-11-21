interface Status {
  data: unknown
  error: boolean
  pending: boolean
  retry: () => void
}

export default function ReportStatus({report, label}: {report:Status; label:string}) {
  if (report.error) return <div role="status" className="text-sm text-muted">
    {label} {report.data === null ? 'unavailable' : 'refresh failed · showing last result'}.{' '}
    <button type="button" className="underline" onClick={report.retry}>Retry</button>
  </div>
  if (report.pending) return <span role="status" className="text-sm text-muted">{report.data === null ? 'Loading' : 'Refreshing'} {label.toLowerCase()}…</span>
  return null
}
