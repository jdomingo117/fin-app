import { useState } from 'react'
import { remainingDays } from '../../lib/budget'
import BudgetValue from '../BudgetValue'
import { fmtCents } from '../../data'
import { budgetValueQualification, type BudgetPresentation, type BudgetValue as Value } from '../../lib/budgetPresentation'
import { budgetSheet, budgetSplit, type SheetGroup } from '../../lib/budgetSheet'

type Column='planned'|'spent'|'third'
const COLUMN_KEY='halcyon.budget.sheet-column'
function readColumn():Column{try{const v=localStorage.getItem(COLUMN_KEY);return v==='planned'||v==='spent'?v:'third'}catch{return 'third'}}

const known=(v:Value):v is Value&{availability:'known';cents:number}=>v.availability==='known'

/** One bar for where the money goes. Widths are display ratios; every amount shown is a server figure. */
function SplitBar({p}:{p:BudgetPresentation}){
  const split=budgetSplit(p)
  const {expected,cashOnce,unallocated}=p.income,allocated=p.sheet.allocated
  if(!split||!known(expected)||!known(cashOnce)||!known(unallocated)||!known(allocated))
    return <p className="budget-split-unavailable detail-copy">The money split isn’t available until every planned total can be read. The amounts below show what is known.</p>
  const income=`${fmtCents(expected.cents)} income${cashOnce.cents>0?` + ${fmtCents(cashOnce.cents)} existing cash`:''}`
  const result=unallocated.cents<0?`${fmtCents(-unallocated.cents)} more than you expect`:`${fmtCents(unallocated.cents)} still to plan`
  const sentence=`${income}, minus ${fmtCents(allocated.cents)} planned, leaves ${result}.`
  return <div className="budget-split">
    <p className="budget-split-equation"><span>{income}</span><span aria-hidden="true">−</span><span>{fmtCents(allocated.cents)} planned</span><span aria-hidden="true">=</span><strong className={unallocated.cents<0?'text-neg':undefined}>{result}</strong></p>
    <div className="budget-split-bar" role="img" aria-label={sentence}>
      {split.segments.map(s=><span key={s.key} className={`budget-split-segment budget-split-segment--${s.key}`} style={{width:`${s.percent}%`}}/>)}
      {split.over&&<span className="budget-split-limit" style={{left:`${split.resourcesPercent}%`}}/>}
    </div>
    <ul className="budget-split-legend" aria-hidden="true">
      {split.segments.map(s=><li key={s.key}><i className={`budget-split-swatch budget-split-segment--${s.key}`}/>{s.label} <span>{fmtCents(s.cents)}</span></li>)}
      {split.over&&<li><i className="budget-split-swatch budget-split-swatch--limit"/>Where your expected money runs out</li>}
    </ul>
  </div>
}

/** A known figure that carries a qualification gets a corner mark; the reason is in the formula bar and the value's own label. */
const flagged=(v:Value|null)=>!!v&&v.availability==='known'&&v.reasons.length>0
function Money({value,name,over}:{value:Value|null;name?:string;over?:boolean}){
  if(!value)return <span className="budget-sheet-none">—<span className="sr-only">Not applicable</span></span>
  return <span className={over?'text-neg':undefined}><BudgetValue name={name} value={value}/>{flagged(value)&&<span className="budget-sheet-flag" aria-hidden="true"/>}</span>
}
const m=(v:Value)=>known(v)?fmtCents(v.cents):'unavailable'
const why=(...values:Value[])=>{const q=[...new Set(values.map(budgetValueQualification).filter(Boolean).flatMap(x=>x.split('; ')))];return q.length?[`About these figures: ${q.join('; ')}.`]:[]}

/** Where an even pace would be today, as a share of the period. Null outside a current period. */
function evenPace(p:BudgetPresentation):{percent:number;day:number;days:number}|null{
  const period=p.period
  if(p.phase!=='current'||!period?.asOf||(period.frequency!=='monthly'&&period.frequency!=='fortnightly'))return null
  try{
    const days=Math.round((Date.parse(`${period.endExclusive}T00:00:00Z`)-Date.parse(`${period.start}T00:00:00Z`))/864e5)
    const left=remainingDays({start:period.start,end:period.endExclusive,timezone:period.timezone,frequency:period.frequency,transition:period.transition},period.asOf)
    const day=days-left
    return days>0&&day>=0&&day<=days?{percent:day/days*100,day,days}:null
  }catch{return null}
}
type Explain={title:string;lines:string[]}
type Select=(key:string,explain:Explain)=>void

function Group({group,selected,select,pace}:{group:SheetGroup;selected:string|null;select:Select;pace:ReturnType<typeof evenPace>}){
  const id=`budget-sheet-${group.key}`
  const spentHead=group.spentLabel==='Spent'?'budget-sheet-head-spent':`${id}-spent`
  const thirdHead=group.thirdLabel==='Left'?'budget-sheet-head-third':`${id}-third`
  return <tbody className="budget-sheet-group" data-sheet-group={group.key}>
    <tr className="budget-sheet-group-row">
      <th scope="colgroup" id={id}>{group.title}</th><td className="col-planned"/>
      {group.spentLabel!=='Spent'?<th scope="col" className="col-spent" id={`${id}-spent`}>{group.spentLabel}</th>:<td className="col-spent"/>}
      {group.thirdLabel!=='Left'?<th scope="col" className="col-third" id={`${id}-third`}>{group.thirdLabel}</th>:<td className="col-third"/>}
    </tr>
    {group.rows.map(row=>{
      const key=`row:${row.id}`,showPace=row.pace&&!!pace&&!!row.meter
      const explain={title:row.name,lines:[...row.explain,...(showPace?[`Today is day ${pace!.day} of ${pace!.days}. The tick on the bar shows where spending at an even pace would be.`]:[])]}
      return <tr key={row.id} className={[row.child?'budget-sheet-child':'',selected===key?'budget-sheet-selected':''].filter(Boolean).join(' ')||undefined} onClick={()=>select(key,explain)} {...(row.lineId?{'data-plan-line':row.lineId}:{})}>
      <th scope="row" id={`${id}-${row.id}`} headers={id}>
        <button type="button" className="budget-sheet-name" aria-pressed={selected===key} aria-controls="budget-sheet-fx" onClick={e=>{e.stopPropagation();select(key,explain)}}>{row.name}</button>
        {row.note&&<span className={`budget-sheet-note${row.over?' text-neg':''}`}>{row.note}</span>}
        {row.meter&&<span className="budget-sheet-meter-wrap"><progress className={`budget-sheet-meter${row.over?' budget-sheet-meter--over':''}`} aria-hidden="true" max={row.meter.max} value={row.meter.value}/>{showPace&&<span className="budget-sheet-pace" aria-hidden="true" style={{left:`${pace!.percent}%`}}/>}</span>}
      </th>
      <td className="col-planned" headers={`budget-sheet-head-planned ${id} ${id}-${row.id}`}><Money value={row.planned} name={row.lineId?`plan-line-${row.lineId}`:undefined}/></td>
      <td className="col-spent" headers={`${spentHead} ${id} ${id}-${row.id}`}><Money value={row.spent}/></td>
      <td className="col-third" headers={`${thirdHead} ${id} ${id}-${row.id}`}><Money value={row.third} over={row.over}/></td>
    </tr>})}
    {group.total&&(()=>{const key=`total:${group.key}`,t=group.total,explain={title:`Total ${group.title.toLowerCase()}`,lines:[`The ${group.rows.filter(r=>r.lineId).length} items in this group, added up by the server: planned ${m(t.planned)}${t.spent?`, ${group.spentLabel.toLowerCase()} ${m(t.spent)}`:''}, ${group.thirdLabel.toLowerCase()} ${m(t.third)}.`,...why(t.planned,...(t.spent?[t.spent]:[]),t.third)]}
     return <tr className={`budget-sheet-total${selected===key?' budget-sheet-selected':''}`} onClick={()=>select(key,explain)}>
      <th scope="row" id={`${id}-total`} headers={id}><button type="button" className="budget-sheet-name" aria-pressed={selected===key} aria-controls="budget-sheet-fx" onClick={e=>{e.stopPropagation();select(key,explain)}}>Total {group.title.toLowerCase()}</button></th>
      <td className="col-planned" headers={`budget-sheet-head-planned ${id}-total`}><Money value={group.total.planned}/></td>
      <td className="col-spent" headers={`${spentHead} ${id}-total`}><Money value={group.total.spent}/></td>
      <td className="col-third" headers={`${thirdHead} ${id}-total`}><Money value={group.total.third} over={known(group.total.third)&&group.key==='fixed'&&group.total.third.cents<0}/></td>
    </tr>})()}
  </tbody>
}

/** Read-only table of the saved plan. It arranges canonical values and never submits a command. */
export default function BudgetSheet({presentation:p}:{presentation:BudgetPresentation}){
  const [column,setColumn]=useState<Column>(readColumn)
  function choose(next:Column){setColumn(next);try{localStorage.setItem(COLUMN_KEY,next)}catch{/* Per-browser convenience only. */}}
  const groups=budgetSheet(p,fmtCents),pace=evenPace(p)
  const [selected,setSelected]=useState<{key:string;explain:Explain}|null>(null)
  const select:Select=(key,explain)=>setSelected(current=>current?.key===key?null:{key,explain})
  const anyFlag=groups.some(g=>g.rows.some(r=>flagged(r.planned)||flagged(r.spent)||flagged(r.third)))
  const {expected,cashOnce,unallocated}=p.income,allocated=p.sheet.allocated
  const summary:Record<string,Explain>={
    income:{title:'Expected income',lines:['Your estimate of take-home pay for this budget. It isn’t income already received.',...why(expected)]},
    cash:{title:'Existing cash to use once',lines:['A one-off top-up from money you already have. It isn’t repeated in future budgets.',...why(cashOnce)]},
    allocated:{title:'Total planned',lines:[`Every planned amount in this budget, added up by the server: ${m(allocated)}.`,...why(allocated)]},
    result:{title:known(unallocated)&&unallocated.cents<0?'Funding gap':'Still to plan',lines:[
      `${known(unallocated)&&unallocated.cents<0?'Funding gap':'Still to plan'} ${m(unallocated)} = expected income ${m(expected)}${known(cashOnce)&&cashOnce.cents===0?'':` + existing cash ${m(cashOnce)}`} − total planned ${m(allocated)}.`,
      known(unallocated)&&unallocated.cents<0?'Your plan uses more than you expect to have. Lower an amount, or check your income.':'Money with no job yet. You can give it to a bill, a goal, or keep it as a buffer.',...why(unallocated,expected,allocated)]},
  }
  const summaryRow=(key:string,label:string,value:Value,name:string,className?:string)=>{const k=`summary:${key}`
    return <tr className={[className,selected?.key===k?'budget-sheet-selected':''].filter(Boolean).join(' ')||undefined} onClick={()=>select(k,summary[key])}>
      <th scope="row"><button type="button" className="budget-sheet-name" aria-pressed={selected?.key===k} aria-controls="budget-sheet-fx" onClick={e=>{e.stopPropagation();select(k,summary[key])}}>{label}</button></th>
      <td><BudgetValue name={name} value={value}/></td><td className="col-spent"/><td className="col-third"/></tr>}
  const gap=known(p.income.unallocated)&&p.income.unallocated.cents<0
  const cashShown=!known(p.income.cashOnce)||p.income.cashOnce.cents!==0
  return <div className="budget-sheet-block">
    <SplitBar p={p}/>
    <div className="budget-sheet-columns" role="group" aria-label="Column to show">
      {(['planned','spent','third'] as const).map(c=><button key={c} type="button" aria-pressed={column===c} onClick={()=>choose(c)}>{c==='planned'?'Planned':c==='spent'?'Spent':'Left'}</button>)}
    </div>
    <div id="budget-sheet-fx" className="budget-sheet-fx" role="status" aria-live="polite">
      <span className="budget-sheet-fx-label" aria-hidden="true">fx</span>
      {selected?<div><strong>{selected.explain.title}</strong>{selected.explain.lines.map((line,i)=><p key={i}>{line}</p>)}</div>
        :<p className="budget-sheet-fx-hint">Choose an item’s name to see how its numbers are worked out.</p>}
    </div>
    <div className="budget-sheet-wrap">
      <table className="budget-sheet" data-column={column}>
        <caption className="sr-only">Your plan for the selected dates, grouped by purpose. Planned amounts are allocations, not bank money.</caption>
        <thead><tr><th scope="col" className="budget-sheet-col-name">Item</th><th scope="col" className="col-planned" id="budget-sheet-head-planned">Planned</th><th scope="col" className="col-spent" id="budget-sheet-head-spent">Spent</th><th scope="col" className="col-third" id="budget-sheet-head-third">Left</th></tr></thead>
        {groups.map(g=><Group key={g.key} group={g} selected={selected?.key??null} select={select} pace={pace}/>)}
        <tbody className="budget-sheet-summary">
          {summaryRow('income','Expected income',expected,'plan-income')}
          {cashShown&&summaryRow('cash','Existing cash to use once',cashOnce,'plan-cash-once')}
          {summaryRow('allocated','Total planned',allocated,'plan-allocated')}
          {summaryRow('result',gap?'Funding gap':'Still to plan',unallocated,'plan-unallocated',`budget-sheet-result${gap?' budget-sheet-result--gap':''}`)}
        </tbody>
      </table>
    </div>
    {(anyFlag||pace)&&<ul className="budget-sheet-key" aria-hidden="true">
      {pace&&<li><i className="budget-sheet-key-pace"/>Where spending at an even pace would be today</li>}
      {anyFlag&&<li><i className="budget-sheet-key-flag"/>This figure may be incomplete. Choose the item to see why.</li>}
    </ul>}
    {gap&&<p className="detail-copy text-warn">Your plan uses more than the money you expect. Adjust an amount to close the gap.</p>}
  </div>
}
