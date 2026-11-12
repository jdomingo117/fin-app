import { useState } from 'react'
import BudgetValue from '../BudgetValue'
import { fmtCents } from '../../data'
import type { BudgetPresentation, BudgetValue as Value } from '../../lib/budgetPresentation'
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

function Money({value,name,over}:{value:Value|null;name?:string;over?:boolean}){
  if(!value)return <span className="budget-sheet-none">—<span className="sr-only">Not applicable</span></span>
  return <span className={over?'text-neg':undefined}><BudgetValue name={name} value={value}/></span>
}

function Group({group}:{group:SheetGroup}){
  const id=`budget-sheet-${group.key}`
  const spentHead=group.spentLabel==='Spent'?'budget-sheet-head-spent':`${id}-spent`
  const thirdHead=group.thirdLabel==='Left'?'budget-sheet-head-third':`${id}-third`
  return <tbody className="budget-sheet-group" data-sheet-group={group.key}>
    <tr className="budget-sheet-group-row">
      <th scope="colgroup" id={id}>{group.title}</th><td className="col-planned"/>
      {group.spentLabel!=='Spent'?<th scope="col" className="col-spent" id={`${id}-spent`}>{group.spentLabel}</th>:<td className="col-spent"/>}
      {group.thirdLabel!=='Left'?<th scope="col" className="col-third" id={`${id}-third`}>{group.thirdLabel}</th>:<td className="col-third"/>}
    </tr>
    {group.rows.map(row=><tr key={row.id} className={row.child?'budget-sheet-child':undefined} {...(row.lineId?{'data-plan-line':row.lineId}:{})}>
      <th scope="row" id={`${id}-${row.id}`} headers={id}>
        <span className="budget-sheet-name">{row.name}</span>
        {row.note&&<span className={`budget-sheet-note${row.over?' text-neg':''}`}>{row.note}</span>}
        {row.meter&&<progress className={`budget-sheet-meter${row.over?' budget-sheet-meter--over':''}`} aria-hidden="true" max={row.meter.max} value={row.meter.value}/>}
      </th>
      <td className="col-planned" headers={`budget-sheet-head-planned ${id} ${id}-${row.id}`}><Money value={row.planned} name={row.lineId?`plan-line-${row.lineId}`:undefined}/></td>
      <td className="col-spent" headers={`${spentHead} ${id} ${id}-${row.id}`}><Money value={row.spent}/></td>
      <td className="col-third" headers={`${thirdHead} ${id} ${id}-${row.id}`}><Money value={row.third} over={row.over}/></td>
    </tr>)}
    {group.total&&<tr className="budget-sheet-total">
      <th scope="row" id={`${id}-total`} headers={id}>Total {group.title.toLowerCase()}</th>
      <td className="col-planned" headers={`budget-sheet-head-planned ${id}-total`}><Money value={group.total.planned}/></td>
      <td className="col-spent" headers={`${spentHead} ${id}-total`}><Money value={group.total.spent}/></td>
      <td className="col-third" headers={`${thirdHead} ${id}-total`}><Money value={group.total.third} over={known(group.total.third)&&group.key==='fixed'&&group.total.third.cents<0}/></td>
    </tr>}
  </tbody>
}

/** Read-only table of the saved plan. It arranges canonical values and never submits a command. */
export default function BudgetSheet({presentation:p}:{presentation:BudgetPresentation}){
  const [column,setColumn]=useState<Column>(readColumn)
  function choose(next:Column){setColumn(next);try{localStorage.setItem(COLUMN_KEY,next)}catch{/* Per-browser convenience only. */}}
  const groups=budgetSheet(p,fmtCents)
  const gap=known(p.income.unallocated)&&p.income.unallocated.cents<0
  const cashShown=!known(p.income.cashOnce)||p.income.cashOnce.cents!==0
  return <div className="budget-sheet-block">
    <SplitBar p={p}/>
    <div className="budget-sheet-columns" role="group" aria-label="Column to show">
      {(['planned','spent','third'] as const).map(c=><button key={c} type="button" aria-pressed={column===c} onClick={()=>choose(c)}>{c==='planned'?'Planned':c==='spent'?'Spent':'Left'}</button>)}
    </div>
    <div className="budget-sheet-wrap">
      <table className="budget-sheet" data-column={column}>
        <caption className="sr-only">Your plan for the selected dates, grouped by purpose. Planned amounts are allocations, not bank money.</caption>
        <thead><tr><th scope="col" className="budget-sheet-col-name">Item</th><th scope="col" className="col-planned" id="budget-sheet-head-planned">Planned</th><th scope="col" className="col-spent" id="budget-sheet-head-spent">Spent</th><th scope="col" className="col-third" id="budget-sheet-head-third">Left</th></tr></thead>
        {groups.map(g=><Group key={g.key} group={g}/>)}
        <tbody className="budget-sheet-summary">
          <tr><th scope="row">Expected income</th><td><BudgetValue name="plan-income" value={p.income.expected}/></td><td className="col-spent"/><td className="col-third"/></tr>
          {cashShown&&<tr><th scope="row">Existing cash to use once</th><td><BudgetValue name="plan-cash-once" value={p.income.cashOnce}/></td><td className="col-spent"/><td className="col-third"/></tr>}
          <tr><th scope="row">Total planned</th><td><BudgetValue name="plan-allocated" value={p.sheet.allocated}/></td><td className="col-spent"/><td className="col-third"/></tr>
          <tr className={`budget-sheet-result${gap?' budget-sheet-result--gap':''}`}><th scope="row">{gap?'Funding gap':'Still to plan'}</th><td><BudgetValue name="plan-unallocated" value={p.income.unallocated}/></td><td className="col-spent"/><td className="col-third"/></tr>
        </tbody>
      </table>
    </div>
    {gap&&<p className="detail-copy text-warn">Your plan uses more than the money you expect. Adjust an amount to close the gap.</p>}
  </div>
}
