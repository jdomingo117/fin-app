import type {BudgetPresentation} from '../../lib/budgetPresentation'
import BudgetValue from '../BudgetValue'
import BudgetSheet from './BudgetSheet'
import {Button} from '../Controls'

/** Saved allocation facts only. Editing and financial arithmetic stay in their existing controllers. */
export default function BudgetPlan({presentation:p,canEdit,onEdit,onActivity}:{presentation:BudgetPresentation;canEdit:boolean;onEdit:()=>void;onActivity:()=>void}){
 const futureGap=p.income.futureUnallocated.availability==='known'&&p.income.futureUnallocated.cents<0
 return <section className="budget-plan" aria-label="Saved allocation plan">
  <header className="budget-plan-heading"><div><h3>Your allowances</h3><p className="budget-plan-lead">{p.phase==='past'?'Selected past budget. Its amounts are read-only.':p.phase==='future'?'Selected future budget. Spending isn’t recorded yet.':'Every job your money has this budget, and how each one is going.'}</p></div><Button disabled={!canEdit} onClick={onEdit}>Adjust plan</Button></header>
  {p.income.expected.freshness==='stale'&&<p role="status" className="outcome-panel">Previously loaded plan · these figures may be out of date.</p>}
  {p.plan.lines.length?<BudgetSheet presentation={p}/>:<p className="body-copy">Saved allocations are unavailable. Refresh before reviewing this plan.</p>}
  <p className="detail-copy text-muted">Planned amounts are allocations, not payments or a bank balance. Existing reserves and carried amounts are separate from new allocations, and adjusting this plan doesn’t move bank money.</p>
  <Button variant="ghost" onClick={onActivity}>View allowance activity</Button>
  <details className="budget-plan-future"><summary>See saved future allowances</summary><p className="body-copy">Continuing plan · separate from the selected budget. Existing-cash top-ups are not repeated. A scheduled frequency change keeps its separately reviewed amounts in settings.</p><dl className="budget-plan-resources"><div><dt>Future expected income</dt><dd><BudgetValue name="plan-future-income" value={p.plan.futureIncome}/></dd></div></dl>
   {p.plan.futureAvailable&&p.plan.futureLines.length>0?<dl className="budget-plan-lines">{p.plan.futureLines.map(line=><div key={line.id} data-future-plan-line={line.id} className="budget-plan-line"><dt>{line.name}</dt><dd><BudgetValue name={`plan-future-line-${line.id}`} value={line.planned}/></dd></div>)}</dl>:<p className="body-copy">Saved future allowances are unavailable. Refresh the budget before reviewing them.</p>}
   <dl className={`budget-plan-unallocated ${futureGap?'text-warn':''}`}><dt>{futureGap?'Future funding gap':'Future still to plan'}</dt><dd><BudgetValue name="plan-future-unallocated" value={p.income.futureUnallocated}/></dd></dl>
  </details>
 </section>
}
