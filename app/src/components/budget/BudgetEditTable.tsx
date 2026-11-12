import { useState, type KeyboardEvent } from 'react'
import { fmtCents } from '../../data'
import { moneyEntry, parseBudgetMoney, type Setup } from '../../lib/budgetWorkspace'

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
  const [entry,setEntry]=useState(moneyEntry(value))
  return <input className="budget-input budget-sheet-input tabular-nums" aria-label={label} inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,2})?" value={entry} data-sheet-input={column} onKeyDown={moveDown}
    onChange={e=>{setEntry(e.target.value);const amount=parseBudgetMoney(e.target.value);e.target.setCustomValidity(amount===null?'Enter a positive amount or zero, using no more than two decimal places.':'');if(amount!==null)onChange(amount)}}/>
}

/**
 * The plan's allowances as an editable table. It edits the same Setup lines the form did, with the same
 * field labels and validation; review, scope, gap acceptance and saving stay with the editor.
 */
export default function BudgetEditTable({setup,active,saved,goals,onLine,onRemove}:{
  setup:Setup;active:boolean;
  /** Saved allocation per line for an active plan, shown so changes are visible. */
  saved:Map<string,number>;
  /** Lines that are savings goals in the saved plan. */
  goals:Set<string>;
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
                <span className="budget-sheet-note">{changed?`Changed from ${fmtCents(was)}`:active&&was!==undefined?`Saved ${fmtCents(was)}`:purposeNames[line.kind]}</span>
                {!active&&line.kind!=='everyday'&&<button type="button" className="budget-text-action budget-sheet-remove" onClick={()=>onRemove(line.id)}>Remove {line.name||'allowance'}</button>}
              </th>
              <td data-label="Planned"><MoneyCell column="planned" label={`Planned for ${line.name||'this allowance'} (AUD)`} value={line.allocation_cents} onChange={allocation_cents=>onLine(line.id,{allocation_cents})}/></td>
              {showOpening&&<td data-label="Already set aside" className={line.kind==='reserve'?undefined:'budget-sheet-edit-empty'}>{line.kind==='reserve'?<MoneyCell column="opening" label={`Already set aside for ${line.name||'this reserve'} (AUD)`} value={line.opening_cents} onChange={opening_cents=>onLine(line.id,{opening_cents})}/>:<span className="budget-sheet-none">—<span className="sr-only">Not applicable</span></span>}</td>}
            </tr>})}
        </tbody>})}
    </table>
  </div>
}
