import BudgetAttention from '../BudgetAttention'
import BudgetForecast from './BudgetForecast'
import BudgetValue from '../BudgetValue'
import { remainingDays } from '../../lib/budget'
import { fmtCents } from '../../data'
import type { BudgetPresentation } from '../../lib/budgetPresentation'
import { Link } from 'react-router-dom'
import { useBehindAccounts } from './useBehindAccounts'
import { useView } from '../../router'
import type { BehindAccount } from '../../lib/budgetFreshness'

const dayFmt=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',timeZone:'UTC'})
const at=(date:string)=>{try{return dayFmt.format(new Date(`${date}T00:00:00Z`))}catch{return date}}

/** Names the accounts that are behind and where to fix them. Shown above the balance it affects. */
function MissingActivityNotice({behind}:{behind:BehindAccount[]}){
  const hasImports=behind.some(account=>account.source==='import')
  const hasSyncs=behind.some(account=>account.source==='sync')
  return <section className="budget-missing-activity" aria-label="Account activity warning">
    <div className="budget-missing-activity-heading">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4m0 4h.01M10.3 4.8l-8 13.2A1.9 1.9 0 0 0 4 21h16a1.9 1.9 0 0 0 1.7-3l-8-13.2a2 2 0 0 0-3.4 0Z"/></svg>
      <div role="status">
        <h3>Recent spending may be missing</h3>
        <p>Your remaining budget may be overstated.</p>
      </div>
    </div>
    <div className="budget-missing-activity-controls">
      <div className="budget-missing-activity-actions">
        {hasImports&&<Link className="budget-text-action" to="/ingestion">Import statements</Link>}
        {hasSyncs&&<Link className="budget-text-action" to="/accounts">Check bank sync</Link>}
      </div>
      <details>
        <summary>{behind.length} {behind.length===1?'account':'accounts'} to check</summary>
        <ul role="list">
          {behind.map(account=><li key={account.account_id}>
            <strong>{account.name}</strong>
            <span>{account.last_date?<>{account.source==='import'?'Last transaction':'Last sync'} <time dateTime={account.last_date}>{at(account.last_date)}</time></>:'No successful sync yet'}</span>
          </li>)}
        </ul>
      </details>
    </div>
  </section>
}

export default function BudgetHero({presentation:p,onEdit,canEdit,onFigures,onGuide,onUnplanned}:{
  presentation:BudgetPresentation;onEdit:()=>void;canEdit:boolean;onFigures:()=>void;onGuide:()=>void;onUnplanned?:()=>void
}){
  const {planned,spent,remaining,carry,rightsMoved}=p.everyday
  const consoleStyle = useView().theme === 'console'
  const behind=useBehindAccounts(p.phase==='current',p.period?.asOf)
  const over=remaining.availability==='known'&&remaining.cents<0
  const gap=p.income.unallocated.availability==='known'&&p.income.unallocated.cents<0
  const meter=planned.availability==='known'&&planned.cents>0&&spent.availability==='known'
    ? Math.min(100,Math.max(0,spent.cents/planned.cents*100)):null
  let days:number|null=null
  if(p.phase==='current'&&p.period?.asOf&&(p.period.frequency==='monthly'||p.period.frequency==='fortnightly')){
    try{days=remainingDays({start:p.period.start,end:p.period.endExclusive,timezone:p.period.timezone,frequency:p.period.frequency,transition:p.period.transition},p.period.asOf)}catch{}
  }
  const qualification=behind.length?'Based on recorded activity so far.':remaining.freshness==='stale'?'Previously loaded figures · finish the data check or check the saved result.':
    remaining.availability==='unavailable'?'The information needed for this balance is unavailable. Review the figures or refresh saved data.':
    p.phase==='future'?'Future plan · this allowance is provisional, with no completed activity yet.':
    p.coverage==='none'?'Planning room only · no account activity is included. Recorded spending is unavailable.':
    p.coverage==='partial'?'Known activity only · some account history is missing, so this may change.':
    remaining.provisional?'Provisional budget balance · earlier activity and carry can still change.':'Based on your selected-account history.'
  return <>
    <section data-budget-module={consoleStyle ? '' : undefined} className="budget-hero" aria-label="Budget overview">
      <div className="budget-hero-main">{behind.length>0&&<MissingActivityNotice behind={behind}/>}{gap&&<p className="budget-phone-funding-notice">{p.income.unallocated.freshness==='stale'?'Previously loaded funding gap':p.phase==='future'?'Future plan funding gap':'Plan funding gap'}: <BudgetValue name="phone-funding-gap" value={p.income.unallocated}/></p>}<h3 className="budget-balance-title">{over?'Over the everyday plan':behind.length?'Left for everyday spending, before missing activity':'Left for everyday spending'}</h3>
        <div className={`budget-hero-amount ${over?'text-neg':''} ${behind.length?'budget-hero-amount--uncertain':''}`}><BudgetValue name="hero-remaining" value={remaining}/></div>
        <p className="budget-spent-line">{spent.availability==='known'&&behind.length?<>Recorded so far: <strong><BudgetValue name="hero-spent" value={spent}/></strong> of your <strong><BudgetValue name="hero-planned" value={planned}/></strong> plan.</>:spent.availability==='known'?<>You’ve spent <strong><BudgetValue name="hero-spent" value={spent}/></strong> of your <strong><BudgetValue name="hero-planned" value={planned}/></strong> plan.</>:<>Your everyday plan is <strong><BudgetValue name="hero-planned" value={planned}/></strong>. Recorded spending is unavailable.</>}</p>
        {onUnplanned&&p.phase!=='past'&&p.income.unallocated.availability==='known'&&p.income.unallocated.cents>0&&<p className="budget-hero-unplanned"><button type="button" className="budget-text-action" onClick={onUnplanned}>{fmtCents(p.income.unallocated.cents)} of your pay isn’t planned yet <span aria-hidden="true">↓</span></button></p>}
        <p className="budget-hero-meaning">{over?'Everyday spending is over its plan. Review your allowances to address the shortfall.':'Room in your plan for day-to-day costs.'} <strong>This is not your bank balance.</strong></p>
        {meter!==null&&<progress className="budget-everyday-meter" aria-label="Everyday spending against the saved plan" aria-valuetext={planned.availability==='known'&&spent.availability==='known'?`${fmtCents(spent.cents)} spent of ${fmtCents(planned.cents)} planned`:undefined} max={100} value={meter}/>}
        <div className="budget-hero-foot"><span>{days===null?(p.phase==='past'?'Completed period':p.phase==='future'?'A provisional plan for future dates':'Saved planning amounts'):`${days} ${days===1?'day':'days'} left after today`}</span>
          <details className="budget-calculation"><summary aria-label="How it works: your everyday balance">How it works</summary><div className="budget-calculation-body"><p>Your everyday amount, plus anything carried over or moved in, minus what you’ve spent on everyday things. Bills and savings goals are counted separately, and refunds reduce spending.</p><dl className="budget-totals"><dt>Planned for everyday</dt><dd><BudgetValue value={planned}/></dd>{(carry.availability!=='known'||carry.cents!==0)&&<><dt>Carried over from last budget</dt><dd><BudgetValue value={carry}/></dd></>}{(rightsMoved.availability!=='known'||rightsMoved.cents!==0)&&<><dt>Moved in from a set-aside</dt><dd><BudgetValue name="everyday-rights" value={rightsMoved}/></dd></>}<dt>Spent so far</dt><dd><BudgetValue value={spent}/></dd><dt>Left</dt><dd><BudgetValue value={remaining}/></dd></dl></div></details>
        </div>
      </div>
      <BudgetAttention/>
      <div className="budget-hero-forecast"><BudgetForecast/></div>
    </section>
    <details data-budget-module={consoleStyle ? '' : undefined} className="budget-income-disclosure"><summary>Income & allocations{gap&&<> · <span className="text-warn">Funding gap <BudgetValue name="overview-funding-gap" value={p.income.unallocated}/></span></>}{p.income.futureUnallocated.availability==='known'&&p.income.futureUnallocated.cents<0&&<> · Continuing plan needs funding</>}</summary>
      <div className="budget-income"><h3 data-module-title className={consoleStyle ? 'console-module-title' : 'budget-eyebrow'}>Your income plan</h3><dl className="budget-income-totals"><div><dt>Expected this budget</dt><dd><BudgetValue name="hero-expected" value={p.income.expected}/></dd></div><div><dt>Received so far</dt><dd><BudgetValue name="hero-received" value={p.income.received}/></dd></div>{p.income.cashOnce.availability==='known'&&p.income.cashOnce.cents!==0&&<div><dt>Existing cash planned once</dt><dd><BudgetValue name="hero-cash" value={p.income.cashOnce}/></dd></div>}</dl>
        <div className={`budget-unallocated ${gap?'budget-funding-gap':''}`}><span>{gap?'Funding gap':'Still to plan'}</span><strong><BudgetValue name="hero-unallocated" value={p.income.unallocated}/></strong></div>
        <p className="budget-income-meaning">{gap?'Your allocations exceed expected resources by this amount. Review your plan to address the gap.':'Expected resources without an allocation yet. This is separate from everyday remaining; some income may not have arrived.'}</p>
        {p.income.futureUnallocated.availability==='known'&&p.income.futureUnallocated.cents<0&&<p className="budget-future-gap">Continuing plan gap: <strong><BudgetValue name="hero-future-gap" value={p.income.futureUnallocated}/></strong>. This is separate from this period’s plan.</p>}
        <button type="button" className="budget-text-action" disabled={!canEdit} onClick={onEdit}>Change my plan <span aria-hidden="true">→</span></button>
      </div>
    </details>
    <div className={`budget-hero-evidence ${remaining.freshness==='stale'||remaining.availability==='unavailable'||p.coverage==='partial'||p.coverage==='unknown'?'budget-qualified':''}`}><p>{qualification}</p><button type="button" className="budget-text-action" onClick={onFigures}>About these figures <span aria-hidden="true">↗</span></button></div>
    <div className="budget-learning-link"><span>New to budgeting, or need a refresher?</span><button type="button" className="budget-text-action" onClick={onGuide}>How your budget works <span aria-hidden="true">→</span></button></div>
  </>
}
