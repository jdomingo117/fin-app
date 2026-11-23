import './console-ingestion.css'
import { useBudget } from '../contexts/BudgetContext'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { useEffect, useState } from 'react'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import { WorkflowSkeleton, WorkflowStatus } from '../components/console/WorkflowHub'
import type { ImportProgress } from '../components/ingest/ImportProgress'
import CSVUploader from '../components/CSVUploader'
import InvestmentCSVUploader from '../components/InvestmentCSVUploader'
import { useAccountIdentifiers } from '../hooks/useAccountIdentifiers'
import ReportStatus from '../components/ReportStatus'
import { useView, navNumber } from '../router'
import {
  INITIAL_TARGET_ACCOUNT_ID,
  accountIdentityLabel,
  accountImportStatus,
  accountOptionLabel,
  selectTargetAccount,
} from '../lib/ingestion/accountSelection'

/**
 * Full-page ingestion portal (SRD §6.E).
 *
 * This view used to carry an entirely separate CSV implementation — its own
 * parser, its own date handling, no AI, no batch id, and an account picked as
 * `accounts[0]` ("for MVP, we will just fetch the first account"). That meant
 * imports landed in whichever account the database returned first and could
 * never be undone.
 *
 * It is now a host for the one shared engine, plus the account selector that
 * was missing. All parsing, categorisation and dedupe live in CSVUploader and
 * lib/csv/.
 */
export default function Ingestion() {
  const identifiers = useAccountIdentifiers()
  const { accounts } = identifiers
  const { go, theme } = useView()
  const { guardTaskNavigation } = useBudget()
  const [accountId, setAccountId] = useState<string>(INITIAL_TARGET_ACCOUNT_ID)
  const [importActive, setImportActive] = useState(false)
  const [progress, setProgress] = useState<ImportProgress>({ phase: 'upload', rows: 0 })

  useUnsavedChanges(theme === 'console' && importActive, true)
  useEffect(() => {
    if (theme !== 'console' || !importActive) return
    return guardTaskNavigation(proceed => {
      if (window.confirm('Leave the import? You’ll need to stage this statement again.')) proceed()
    })
  }, [theme, importActive, guardTaskNavigation])

  const account = accounts.find((a) => a.id === accountId)
  const consoleStyle = theme === 'console'
  const steps = ['Target account', 'Upload', 'Review rows', 'Import']
  const activeStep = !account ? 0 : progress.phase === 'upload' ? 1 : progress.phase === 'review' ? 2 : 3
  const status = progress.phase === 'done' ? 'Complete' : activeStep >= 2 ? progress.rows : account ? 'Ready' : 'Choose account'
  const uploadTitle = activeStep < 2 ? 'Statement upload' : activeStep === 2
    ? account?.type === 'Invest' ? 'Review investment rows' : undefined : 'Import statement'

  return (
    <Screen>
      <ViewHeader
        index={`${navNumber('ingestion')} — Ingestion`}
        title="Ingestion"
        sub="Import statements, categorise, reconcile balances"
      />
      {consoleStyle&&<WorkflowStatus label={activeStep >= 2 && progress.phase !== 'done' ? 'Rows staged' : 'Import status'}>{status}</WorkflowStatus>}
      {consoleStyle&&<ol className="console-ingestion-steps" aria-label="Statement import progress">
        {steps.map((label, index) => <li key={label} aria-current={index === activeStep ? 'step' : undefined}
          data-done={index < activeStep || progress.phase === 'done'}>
          <span aria-hidden="true">{index < activeStep || progress.phase === 'done' ? '✓' : index + 1}</span>{label}
        </li>)}
      </ol>}
      {consoleStyle && identifiers.pending && !identifiers.error && !accounts.length
        ? <WorkflowSkeleton label="Loading eligible accounts" /> : <Grid>
        <Tile title="Target account" span={3} className="workflow-surface">
          <ReportStatus report={identifiers} label="Account identifiers" />
          {accounts.length === 0 ? (
            <p className="body-copy">
              Create an account before importing — transactions have to belong to one.
            </p>
          ) : (
            <div className={`grid gap-2 pt-1 ${consoleStyle ? 'console-ingestion-controls' : ''}`}>
              <label className="grid gap-1.5 sm:max-w-[520px]">
                <span className="micro text-muted">Import into</span>
                <select
                  data-control-kind={consoleStyle ? 'select' : undefined}
                  data-control-variant={consoleStyle ? 'console' : undefined}
                  value={accountId}
                  onChange={(event) => {
                    const next = selectTargetAccount(accountId, event.target.value, importActive)
                    if (next !== accountId) setProgress({ phase: 'upload', rows: 0 })
                    setAccountId(next)
                  }}
                  disabled={importActive}
                  aria-describedby="target-account-help"
                  className="min-h-11 rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[14px] outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="" disabled>Choose an account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{accountOptionLabel(a)}</option>
                  ))}
                </select>
              </label>
              {account ? (
                <div className="grid gap-1 rounded-[10px] border border-[var(--hair)] bg-black/[0.02] px-3 py-2 text-[13px] text-ink2 sm:max-w-[520px]">
                  <span><strong className="text-ink">{account.name}</strong> · {account.type}</span>
                  <span>{accountIdentityLabel(account)} · {accountImportStatus(account)}</span>
                </div>
              ) : null}
              <p id="target-account-help" className="text-[13px] text-ink2">
                {importActive
                  ? 'Target locked while this file is being prepared. Cancel or finish the import to choose another account.'
                  : account
                    ? 'Rows are matched against this account only; duplicate statements are detected and skipped.'
                    : 'Choose the ledger this statement belongs to before selecting a file.'}
              </p>
            </div>
          )}
        </Tile>

        {!account && accounts.length > 0 && (
          <Tile title="Statement upload" span={3} className="workflow-surface">
            <p className="body-copy">
              Choose a target account above to open its statement importer and upload history.
            </p>
          </Tile>
        )}

        {account && (
          <Tile title={consoleStyle ? uploadTitle : 'Statement upload'} span={3} className="workflow-surface">
            {account.type === 'Invest' ? (
              <InvestmentCSVUploader
                key={account.id}
                accountId={account.id}
                accountName={account.name}
                onImportStateChange={setImportActive}
                onProgress={consoleStyle ? setProgress : undefined}
                onReviewTransfers={() => go('transfers')}
              />
            ) : (
              <CSVUploader
                key={account.id}
                accountId={account.id}
                accountName={account.name}
                accountType={account.type}
                isConnected={Boolean(account.accountConnectionId || account.balanceSource === 'bank_provider')}
                cutoverDate={account.cutoverDate}
                onImportStateChange={setImportActive}
                onProgress={consoleStyle ? setProgress : undefined}
                onReviewTransfers={() => go('transfers')}
              />
            )}
          </Tile>
        )}
      </Grid>}
    </Screen>
  )
}
