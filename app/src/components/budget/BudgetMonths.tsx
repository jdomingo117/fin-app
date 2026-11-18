import { useEffect, useRef, useState } from 'react'
import { useBudget } from '../../contexts/BudgetContext'
import { fmtCents } from '../../data'
import { addDays } from '../../lib/budget'
import { budgetMonthsRows, MONTHS_GROUP_TITLES, type BudgetMonths as Months, type MonthsCell, type MonthsGroupKey } from '../../lib/budgetMonths'
import { budgetDate } from './BudgetPageHeader'
import { Button } from '../Controls'

function periodLabel(start:string,endExclusive:string){
  return start.slice(8)==='01'&&endExclusive.slice(8)==='01'?budgetDate(start,true):`${budgetDate(start)} – ${budgetDate(addDays(endExclusive,-1))}`
}
const usedLabel:Record<MonthsGroupKey,string>={fixed:'paid',everyday:'spent',reserve:'set aside',goal:'saved',contribution:'planned'}

function Cell({cell,group}:{cell:MonthsCell;group:MonthsGroupKey}){
  if(cell.state==='absent')return <td className="budget-months-absent">—<span className="sr-only">Not in this budget</span></td>
  if(cell.state==='unavailable')return <td className="budget-months-absent">Unavailable</td>
  const style=cell.ratio===null?undefined:{['--months-fill' as string]:`${Math.round(Math.min(cell.ratio,1)*100)}%`}
  return <td className={`budget-months-cell${cell.over?' budget-months-cell--over':''}${cell.ratio!==null?' budget-months-cell--shaded':''}`} style={style}>
    <span className="budget-months-main">{fmtCents(cell.main)}</span>
    {cell.of!==null&&<span className="budget-months-of">of {fmtCents(cell.of)}{cell.over&&<> · <span className="budget-months-over">over</span></>}</span>}
    <span className="sr-only"> {usedLabel[group]}</span>
  </td>
}

/** Read-only months view for Look back. Every figure is a server figure for that period; nothing is added up here. */
export default function BudgetMonths({active}:{active:boolean}){
  const b=useBudget(),s=b.snapshot
  const read=useRef(b.months);read.current=b.months
  const key=s?.plan&&s.period?`${s.plan.id}|${s.period.id}|${s.source_revision}|${s.plan.version}`:null
  const [state,setState]=useState<{key:string;data:Months|null;error:string|null}|null>(null)
  const [attempt,setAttempt]=useState(0)
  // One read each time Look back opens (or on request). Changes made while it's open don't trigger
  // another read: the page's own refresh already uses the read budget, so this view says it may be
  // out of date and offers an explicit update instead.
  const loaded=useRef<string|null>(null),ready=b.readState==='ready',mounted=useRef(true)
  useEffect(()=>()=>{mounted.current=false},[])
  useEffect(()=>{
    if(!active){loaded.current=null;return}
    // Opening Look back or asking to update reads again; other changes only mark the view out of date.
    const marker=String(attempt)
    if(!key||!ready||loaded.current===marker)return
    loaded.current=marker
    // A refresh flipping readState mustn't discard this read, or the view would stay on "Reading…".
    read.current().then(data=>{if(!data){loaded.current=null;return}if(mounted.current)setState({key,data,error:null})},
      ()=>{if(mounted.current)setState({key,data:null,error:'The month-by-month view couldn’t be read. Your budget is unchanged.'})})
  },[active,attempt,ready,key!==null])
  if(!active||!s?.plan)return null
  const data=state?.data??null,outdated=!!state&&state.key!==key
  const rows=data?budgetMonthsRows(data):[]
  const groups=(['fixed','everyday','reserve','goal','contribution'] as const).map(g=>({g,rows:rows.filter(r=>r.group===g)})).filter(x=>x.rows.length)
  return <section className="budget-months" aria-labelledby="budget-months-title">
    <h4 id="budget-months-title">Month by month</h4>
    <p className="detail-copy">Your recent budgets side by side, up to the last 12. Bills and everyday spending show what was used of the plan; set-asides and goals show what was saved so far. Shading shows how much of the plan was used, and red means over plan.</p>
    {outdated&&data&&<p className="detail-copy text-warn">These figures are for a different budget or from before your latest change. <button type="button" className="budget-text-action" onClick={()=>setAttempt(n=>n+1)}>Update month by month</button></p>}
    {state?.error?<div className="outcome-panel"><p className="text-neg">{state.error}</p><Button variant="ghost" onClick={()=>setAttempt(n=>n+1)}>Try again</Button></div>
     :!data?<p role="status" className="detail-copy">Reading your recent budgets…</p>
     :<>{data.periods.length<2&&<p className="detail-copy">This fills in as you complete more budgets.</p>}
      <div className="data-table-wrap budget-months-wrap" tabIndex={0} role="region" aria-label="Month by month. Scroll sideways to see every budget.">
        <table className="budget-months-table">
          <caption className="sr-only">Each saved line across your recent budgets. Amounts are recorded figures for that budget, not bank balances.</caption>
          <thead><tr><th scope="col">Item</th>{data.periods.map(p=><th key={p.period_id} scope="col" aria-current={p.period_id===s.period?.id?'date':undefined}>{periodLabel(p.start_date,p.end_date)}</th>)}</tr></thead>
          {groups.map(({g,rows})=><tbody key={g} data-months-group={g}>
            <tr className="budget-months-group"><th scope="colgroup" colSpan={data.periods.length+1}>{MONTHS_GROUP_TITLES[g]}</th></tr>
            {rows.map(r=><tr key={r.id} data-months-line={r.id}><th scope="row">{r.name}</th>{r.cells.map((c,i)=><Cell key={data.periods[i].period_id} cell={c} group={g}/>)}</tr>)}
          </tbody>)}
        </table>
      </div></>}
  </section>
}
