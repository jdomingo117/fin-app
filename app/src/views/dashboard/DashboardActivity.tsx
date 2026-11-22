import { useState } from 'react'
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
  const report = useReport(id, tenant => reportParent(tenant, id!, accounts), !!id, true)
  const transaction = report.data
  const rowSelector = selection ? `[data-dashboard-activity="${CSS.escape(selection.rowId)}"]` : undefined
  function close() {
    const opener = selection?.opener
    select(undefined)
    if (!transaction && opener?.isConnected) opener.focus({ preventScroll: true })
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
      <TransactionCategoryDrawer transaction={transaction} redacted={redacted} onClose={close} restoreSelector={rowSelector} onChanged={async () => {
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
