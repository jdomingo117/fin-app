import { motion } from 'framer-motion'
import type { Account, Txn } from '../../data'
import { ConsoleFigureStrip, ConsoleHeadline, ConsoleHeroArt, consoleMoney, type ConsoleArt, type ConsoleFigure } from './ConsoleHub'
import { enabledSections, type SectionId } from './sections'
import { FocusRow, SectionFocusRow } from './FocusRow'
import { consoleRise, useConsoleReducedMotion } from './motion'
import { FocusRing } from './FocusRing'
import { useConsolePreferences } from './ConsolePreferences'
import { GlassSurface } from './GlassSurface'
import './console-dashboard.css'

type Props = {
  figures: Partial<Record<SectionId, ConsoleFigure[]>>
  activity?: Txn[]
  accounts: Account[]
  period: string
  latestDate?: string
  trends: Partial<Record<SectionId, ConsoleArt>>
  activeId: SectionId
  selectSection: (section: SectionId) => void
  restoreFocus: boolean
  covered: boolean
  open: (section: SectionId) => void
  openTransaction: (transaction: Txn) => void
}

export default function ConsoleHome({
  figures, activity, accounts, period, latestDate, trends, activeId, selectSection, restoreFocus,
  covered, open, openTransaction,
}: Props) {
  const reduce = useConsoleReducedMotion()
  const audio = useConsolePreferences()
  const section = enabledSections.find(item => item.id === activeId) ?? enabledSections[0]
  const [headline, ...secondary] = figures[section.id] ?? []
  const cards = activity?.slice(0, 4)
  const isFlow = section.id === 'income' || section.id === 'expenses'

  return (
    <section className="console-home" aria-label="Dashboard section previews" data-paused={covered}>
      <SectionFocusRow items={enabledSections} activeId={activeId} restoreFocus={restoreFocus}
        onPreview={selectSection} onActivate={open} />
      <motion.div
        key={section.id}
        className="console-preview"
        data-section={section.id}
        {...consoleRise(reduce)}
      >
        <div className="console-hero">
          <div className="console-summary">
            <ConsoleHeadline id={section.id} label={`${section.name}${headline ? ` · ${headline.label}` : ''}`}
              figure={headline} reduced={!!reduce} period={isFlow ? period : undefined} />
            {secondary.length > 0 && <ConsoleFigureStrip figures={secondary} />}
            {isFlow && latestDate && <p className="console-asof">Latest transaction · {latestDate}</p>}
          </div>
          <ConsoleHeroArt id={section.id} art={trends[section.id]} reduced={!!reduce} />
        </div>
        {section.id === 'accounts' && <div className="console-activity">
          <h2>Accounts</h2>
          {accounts.length ? <FocusRow label="Account cards" className="console-activity-row">
            {accounts.map(account => <GlassSurface as="button" material="activity" key={account.id} className="console-activity-card"
              data-console-row-item onClick={() => open('accounts')}>
              <FocusRing layer="sweep" />
              <span className="console-card-emblem"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18v12H3zM3 10h18M7 15h4" /></svg></span>
              <span className="console-card-category">{account.type}{account.institution ? ` · ${account.institution}` : ''}</span>
              <strong className="tabular-nums" data-sign={account.balance < 0 ? 'negative' : undefined}>{consoleMoney(account.balance)}</strong>
              <span className="console-card-title">{account.name}</span>
            </GlassSurface>)}
          </FocusRow> : <p className="console-empty">No accounts to show.</p>}
        </div>}
        {(cards?.length || isFlow) ? <div className="console-activity">
          <h2>{isFlow ? 'Activity in this period' : 'Recent activity'}</h2>
          {cards?.length ? <FocusRow label="Transaction cards" className="console-activity-row">
            {cards.map(transaction => {
              const category = transaction.cat || 'Transaction'
              const merchant = transaction.merchant || 'Transaction details'
              const amount = consoleMoney(transaction.amount, true)
              return (
                <GlassSurface as="button" material="activity" className="console-activity-card" key={transaction.id}
                  data-console-row-item onClick={() => { audio?.play('select'); openTransaction(transaction) }}>
                  <FocusRing layer="sweep" />
                  <span className="console-card-emblem"><ActivityIcon transaction={transaction} /></span>
                  <span className="console-card-category">{category}</span>
                  <strong className="tabular-nums" data-sign={transaction.amount > 0 ? 'positive' : transaction.amount < 0 ? 'negative' : undefined}>{amount}</strong>
                  <span className="console-card-title">{merchant}</span>
                </GlassSurface>
              )
            })}
          </FocusRow> : <p className="console-empty">{activity ? 'No matching transactions in the recent preview.' : 'Activity is unavailable.'}</p>}
        </div> : null}
      </motion.div>
    </section>
  )
}

function ActivityIcon({ transaction }: { transaction: Txn }) {
  const path = transaction.amount > 0 ? 'M4 16l6-6 4 4 6-8m-5 0h5v5'
    : transaction.cat?.toLowerCase().includes('grocer') ? 'M3 4h2l2 10h11l2-7H6m2 11h.01m9 0h.01'
    : transaction.cat?.toLowerCase().includes('transport') ? 'M4 14l2-6h12l2 6v5h-2v-2H6v2H4zm0 0h16'
    : 'M6 3h12v18l-3-2-3 2-3-2-3 2zm3 6h6m-6 4h6'
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={path} /></svg>
}
