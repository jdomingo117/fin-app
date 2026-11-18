/** Read-only month-by-month facts for Look back (query-budget `months`, migration 20261118000000). */
export type BudgetMonthsLine={line_id:string;name:string;kind:'fixed'|'everyday'|'reserve'|'contribution';goal:boolean;archived:boolean;
  planned_cents:number|null;used_cents:number|null;remaining_cents:number|null;reserve_cents:number|null;target_cents:number|null}
export type BudgetMonths={plan_id:string;period_id:string;source_revision:string;plan_version:string;
  periods:{period_id:string;start_date:string;end_date:string;lines:BudgetMonthsLine[]}[]}

export type MonthsGroupKey='fixed'|'everyday'|'reserve'|'goal'|'contribution'
export type MonthsCell=
  |{state:'absent'}
  |{state:'unavailable'}
  |{state:'known';main:number;of:number|null;over:boolean;
    /** Display ratio for shading (0–1.25), never shown as money. */ratio:number|null}
export type MonthsRow={id:string;name:string;group:MonthsGroupKey;cells:MonthsCell[]}

const ORDER:MonthsGroupKey[]=['fixed','everyday','reserve','goal','contribution']
export const MONTHS_GROUP_TITLES:Record<MonthsGroupKey,string>={fixed:'Bills and regular payments',everyday:'Everyday spending',reserve:'Set aside',goal:'Goals',contribution:'Planned transfers'}
const safe=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)

function cell(line:BudgetMonthsLine|undefined,group:MonthsGroupKey):MonthsCell{
  if(!line)return {state:'absent'}
  if(group==='fixed'||group==='everyday'){
    if(!safe(line.used_cents)||!safe(line.planned_cents))return {state:'unavailable'}
    const over=safe(line.remaining_cents)&&line.remaining_cents<0
    return {state:'known',main:line.used_cents,of:line.planned_cents,over,ratio:line.planned_cents>0?Math.min(1.25,Math.max(0,line.used_cents/line.planned_cents)):null}
  }
  if(group==='contribution')return safe(line.planned_cents)?{state:'known',main:line.planned_cents,of:null,over:false,ratio:null}:{state:'unavailable'}
  if(!safe(line.reserve_cents))return {state:'unavailable'}
  const target=group==='goal'&&safe(line.target_cents)&&line.target_cents>0?line.target_cents:null
  return {state:'known',main:line.reserve_cents,of:target,over:false,ratio:target?Math.min(1,Math.max(0,line.reserve_cents/target)):null}
}

/** Rows are every line seen in the window, named as in its latest period. No money is added up here. */
export function budgetMonthsRows(m:BudgetMonths):MonthsRow[]{
  const latest=new Map<string,BudgetMonthsLine>()
  for(const p of m.periods)for(const l of p.lines)latest.set(l.line_id,l)
  const byPeriod=m.periods.map(p=>new Map(p.lines.map(l=>[l.line_id,l])))
  const groupOf=(l:BudgetMonthsLine):MonthsGroupKey=>l.goal?'goal':l.kind
  return [...latest.values()]
    .sort((a,b)=>ORDER.indexOf(groupOf(a))-ORDER.indexOf(groupOf(b))||a.name.localeCompare(b.name))
    .map(l=>({id:l.line_id,name:l.name,group:groupOf(l),cells:byPeriod.map(p=>cell(p.get(l.line_id),groupOf(l)))}))
}
