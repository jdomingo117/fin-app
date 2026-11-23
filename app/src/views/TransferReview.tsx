import './console-transfers.css'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import OskoLinker from '../components/OskoLinker'
import { Button } from '../components/Controls'
import { ConsoleModule } from '../components/console/ConsoleHub'
import { useView, navNumber } from '../router'

/** Dedicated decision inbox for bank-to-bank and bank-to-investment movements.
 * Statement import deliberately lives elsewhere: this page can be revisited
 * whenever the rail badge reports pending work, without carrying upload state. */
export default function TransferReview() {
  const { go, theme } = useView()
  if (theme === 'console') return <Screen>
    <div className="console-workflow-grid">
      <Tile title="Reconciliation queue" className="workflow-surface min-w-0"><OskoLinker /></Tile>
      <aside className="console-workflow-companions" aria-label="Transfer context">
        <ConsoleModule title="How decisions work" kind="flat">
          <div className="grid justify-items-start gap-3">
            <p className="text-muted">Confirm movements between your accounts as internal transfers. Halcyon excludes them from income and spending.</p>
            <p className="text-muted">Count a payment or deposit as regular activity if it belongs in income or spending.</p>
            <Button variant="ghost" onClick={() => go('ingestion')}>Import a statement</Button>
          </div>
        </ConsoleModule>
      </aside>
    </div>
  </Screen>

  return (
    <Screen>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ViewHeader
          index={`${navNumber('transfers')} — Reconciliation`}
          title="Transfer review"
          sub="Resolve movements between accounts without distorting income or spending"
        />
        <div className="pt-1.5">
          <Button variant="ghost" onClick={() => go('ingestion')}>Import a statement</Button>
        </div>
      </div>
      <Grid>
        <Tile title="Reconciliation inbox" tag="Decisions update analytics" span={3} className="workflow-surface">
          <OskoLinker />
        </Tile>
      </Grid>
    </Screen>
  )
}
