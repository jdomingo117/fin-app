import { type KeyboardEvent } from 'react'
import { fmtCents } from '../../data'
import type { Setup } from '../../lib/budgetWorkspace'
import BudgetAmountInput from './BudgetAmountInput'

type Line=Setup['lines'][number]
const purposeNames={everyday:'Everyday spending',fixed:'Regular bills',reserve:'Set money aside',contribution:'Planned transfer'}
const groups:{key:'fixed'|'everyday'|'reserve'|'goal'|'contribution';title:string}[]=[
  {key:'fixed',title:'Bills and regular payments'},{key:'everyday',title:'Everyday spending'},
  {key:'reserve',title:'Set aside'},{key:'goal',title:'Goals'},{key:'contribution',title:'Planned transfers'},
]

/** Enter moves down the same column, like a spreadsheet; the form itself never submits on Enter. */
function moveDown(e:KeyboardEvent<HTMLInputElement>){
  if(e.key!=='Enter')return
  e.preventDefault()
  const column=e.currentTarget.dataset.sheetInput,table=e.currentTarget.closest('table')
  const inputs=[...(table?.querySelectorAll<HTMLInputElement>(`input[data-sheet-input="${column}"]`)??[])]
  inputs[inputs.indexOf(e.currentTarget)+1]?.focus()
}

function MoneyCell({label,value,onChange,column}:{label:string;value:number;onChange:(cents:number)=>void;column:string}){
  return <BudgetAmountInput label={label} value={value} onChange={onChange} column={column} onKeyDown={moveDown}/>
}

/**
 * The plan's allowances as an editable table. It edits the same Setup lines the form did, with the same
 * field labels and validation; review, scope, gap acceptance and saving stay with the editor.
 */
export default function BudgetEditTable({setup,active,saved,goals,sources=new Map(),onLine,onRemove}:{
  setup:Setup;active:boolean;
  /** Saved allocation per line for an active plan, shown so changes are visible. */
  saved:Map<string,number>;
  /** Lines that are savings goals in the saved plan. */
  goals:Set<string>;
  /** For an assisted draft: where each amount came from ("From your history", "Your number"…). */
  sources?:Map<string,string>;
  onLine:(id:string,patch:Partial<Line>)=>void;onRemove:(id:string)=>void;
}){
  const showOpening=!active&&setup.lines.some(l=>l.kind==='reserve')
  const keyOf=(l:Line)=>l.kind==='reserve'&&goals.has(l.id)?'goal':l.kind
  return <div className="budget-sheet-wrap">
    <table className="budget-sheet budget-sheet--edit">
      <caption className="sr-only">Planned amount for each allowance. Changing an amount doesn’t move money; you review the effect before anything is saved.</caption>
      <thead><tr><th scope="col" className="budget-sheet-col-name">Item</th><th scope="col">Planned</th>{showOpening&&<th scope="col">Already set aside</th>}</tr></thead>
      {groups.map(g=>{const rows=setup.lines.filter(l=>keyOf(l)===g.key);if(!rows.length)return null
        return <tbody key={g.key} className="budget-sheet-group" data-sheet-group={g.key}>
          <tr className="budget-sheet-group-row"><th scope="colgroup" colSpan={showOpening?3:2}>{g.title}</th></tr>
          {rows.map(line=>{const was=saved.get(line.id),changed=active&&was!==undefined&&was!==line.allocation_cents
            return <tr key={line.id} data-edit-line={line.id} className={changed?'budget-sheet-changed':undefined}>
              <th scope="row">
                {active?<span className="budget-sheet-name">{line.name}</span>
                  :<input required maxLength={60} className="budget-input budget-sheet-name-input" aria-label={`Allowance name · ${purposeNames[line.kind]}`} value={line.name} onChange={e=>onLine(line.id,{name:e.target.value})}/>}
                <span className={`budget-sheet-note${sources.get(line.id)==='Your number'?' budget-sheet-source--own':''}`} data-line-source={sources.get(line.id)}>{changed?`Changed from ${fmtCents(was)}`:active&&was!==undefined?`Saved ${fmtCents(was)}`:sources.has(line.id)?`${purposeNames[line.kind]} · ${sources.get(line.id)}`:purposeNames[line.kind]}</span>
                {!active&&line.kind!=='everyday'&&<button type="button" className="budget-text-action budget-sheet-remove" onClick={()=>onRemove(line.id)}>Remove {line.name||'allowance'}</button>}
              </th>
              <td data-label="Planned"><MoneyCell column="planned" label={`Planned for ${line.name||'this allowance'} (AUD)`} value={line.allocation_cents} onChange={allocation_cents=>onLine(line.id,{allocation_cents})}/></td>
              {showOpening&&<td data-label="Already set aside" className={line.kind==='reserve'?undefined:'budget-sheet-edit-empty'}>{line.kind==='reserve'?<MoneyCell column="opening" label={`Already set aside for ${line.name||'this reserve'} (AUD)`} value={line.opening_cents} onChange={opening_cents=>onLine(line.id,{opening_cents})}/>:<span className="budget-sheet-none">—<span className="sr-only">Not applicable</span></span>}</td>}
            </tr>})}
        </tbody>})}
    </table>
  </div>
}

/** Read-only draft table for the assisted review step: every line, its planned amount and where it came from. */
export function BudgetDraftTable({setup,sources,goalLine}:{setup:Setup;sources:Map<string,string>;goalLine?:string}){
  const keyOf=(l:Line)=>l.kind==='reserve'&&l.id===goalLine?'goal':l.kind
  return <div className="budget-sheet-wrap">
    <table className="budget-sheet budget-sheet--draft">
      <caption className="sr-only">Every line in this draft, its planned amount and where the amount came from. Nothing is saved yet.</caption>
      <thead><tr><th scope="col" className="budget-sheet-col-name">Item</th><th scope="col">Planned</th><th scope="col">Where it came from</th></tr></thead>
      {groups.map(g=>{const rows=setup.lines.filter(l=>keyOf(l)===g.key);if(!rows.length)return null
        return <tbody key={g.key} className="budget-sheet-group" data-sheet-group={g.key}>
          <tr className="budget-sheet-group-row"><th scope="colgroup" colSpan={3}>{g.title}</th></tr>
          {rows.map(line=><tr key={line.id} data-draft-line={line.id}>
            <th scope="row"><span className="budget-sheet-name">{line.name}</span></th>
            <td>{fmtCents(line.allocation_cents)}</td>
            <td className={sources.get(line.id)==='Your number'?'budget-sheet-source--own':undefined}>{sources.get(line.id)??'—'}</td>
          </tr>)}
        </tbody>})}
    </table>
  </div>
}
