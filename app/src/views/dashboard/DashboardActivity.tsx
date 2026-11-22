import { useLayoutEffect, useRef, useState } from 'react'
import Ledger from '../../components/Ledger'
import ReportStatus from '../../components/ReportStatus'
import TransactionCategoryDrawer from '../../components/TransactionCategoryDrawer'
import { useData } from '../../contexts/DataContext'
import { useAuth } from '../../contexts/AuthContext'
import type { Txn } from '../../data'
import { useReport } from '../../hooks/useReport'
import { reportParent } from '../../lib/reportParent'
import { useView } from '../../router'

type ActivityReport = { data: Txn[] | null; pending: boolean; error: boolean; retry: () => void }

export function useDashboardTransaction(redacted = false) {
  const { accounts, refreshData } = useData()
  const { user, tenantId } = useAuth()
  const { toast } = useView()
  const scope = `${user?.id ?? ''}/${tenantId ?? ''}`
  const [selection, select] = useState<{ scope: string; id: string; rowId: string; opener: HTMLElement | null }>()
  const id = selection?.scope === scope ? selection.id : undefined
  const report = useReport(id, tenant => reportParent(tenant, id!, accounts), !!id)
  const [previous, setPrevious] = useState<{ scope: string; id: string; data: Txn }>()
  const returnRow = useRef<string>()
  useLayoutEffect(() => {
    if (id && report.data) setPrevious({ scope, id, data: report.data })
  }, [scope, id, report.data])
  const transaction = report.data ?? (previous?.id === id && previous?.scope === scope && id ? previous.data : null)
  function restoreRow() {
    const id = returnRow.current
    returnRow.current = undefined
    if (!id) return
    requestAnimationFrame(() => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      document.querySelector<HTMLElement>(`[data-dashboard-activity="${CSS.escape(id)}"]`)?.focus({ preventScroll: true })
    })
  }
  function close() {
    const opener = selection?.opener
    returnRow.current = selection?.rowId
    select(undefined)
    setPrevious(undefined)
    if (!transaction) {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
      else restoreRow()
    }
  }
  return {
    open: !!id,
    edit: (row: Txn) => select({
      scope, id: row.parentTransactionId ?? row.id, rowId: row.id,
      opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    }),
    drawer: <>
      {id && !transaction && <div className="console-transaction-status">
        <ReportStatus report={report} label="Transaction details" />
        {report.error && <button type="button" onClick={close}>Dismiss</button>}
      </div>}
      <TransactionCategoryDrawer transaction={transaction} redacted={redacted} onClose={close} onAfterClose={restoreRow} onChanged={async () => {
        await refreshData()
        toast({ title: 'Transaction updated', sub: 'Dashboard activity has been refreshed.' })
      }} />
    </>,
  }
}

export function DashboardActivity({ report, onEdit, consoleStyle, redacted }: {
  report: ActivityReport
  onEdit: (transaction: Txn) => void
  consoleStyle?: boolean
  redacted?: boolean
}) {
  const { go } = useView()
  return <>
    <ReportStatus report={report} label="Recent activity" />
    {report.data && (report.data.length ? <Ledger consoleStyle={consoleStyle} redacted={redacted} rows={report.data} onEdit={onEdit} /> :
      <div className="py-10 text-center">
        <p className="body-copy">No transactions yet.</p>
        <button type="button" onClick={() => go('ingestion')} className="mt-3 text-[13px] font-semibold text-accent hover:opacity-80">Import a statement</button>
      </div>)}
  </>
}
