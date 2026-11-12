import type { BudgetPresentation } from './budgetPresentation'
import type { BudgetValue } from './budgetPresentation'

/** Server-calculated group totals for the My plan table (migration 20261112020000). */
export type BudgetSheetGroupKey = 'fixed'|'everyday'|'reserve'|'goal'|'contribution'
export type BudgetSheetFacts = {
  groups:{key:BudgetSheetGroupKey;count:number;planned_cents:number|null;used_cents:number|null;remaining_cents:number|null;
    reserve_cents:number|null;purchases_cents:number|null;bank_confirmed_cents:number|null}[]
  allocated_cents:number|null
}

export type SheetRow = {
  id:string;name:string;note:string|null;over:boolean;child:boolean;
  /** The saved plan line this row represents, if any (category rows have none). */
  lineId:string|null;
  planned:BudgetValue;spent:BudgetValue|null;third:BudgetValue;
  /** Display-only meter: value and maximum in cents, or null when not meaningful. */
  meter:{value:number;max:number}|null;
}
export type SheetGroup = {
  key:BudgetSheetGroupKey;title:string;spentLabel:string;thirdLabel:string;rows:SheetRow[];
  /** Only for groups with more than one saved line; a single line is its own total. */
  total:{planned:BudgetValue;spent:BudgetValue|null;third:BudgetValue}|null;
}

const GROUPS:{key:BudgetSheetGroupKey;title:string;spentLabel:string;thirdLabel:string}[]=[
  {key:'fixed',title:'Bills and regular payments',spentLabel:'Paid',thirdLabel:'Left'},
  {key:'everyday',title:'Everyday spending',spentLabel:'Spent',thirdLabel:'Left'},
  {key:'reserve',title:'Set aside',spentLabel:'Spent',thirdLabel:'Set aside so far'},
  {key:'goal',title:'Goals',spentLabel:'Spent',thirdLabel:'Saved so far'},
  {key:'contribution',title:'Planned transfers',spentLabel:'Spent',thirdLabel:'Confirmed'},
]

const dayFmt=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',timeZone:'UTC'})
const yearFmt=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
const at=(date:string,year=false)=>{try{return (year?yearFmt:dayFmt).format(new Date(`${date}T00:00:00Z`))}catch{return date}}
const known=(v:BudgetValue|null|undefined):v is BudgetValue&{availability:'known';cents:number}=>!!v&&v.availability==='known'
/** An explicitly unavailable value sharing another value's qualification; it never carries cents. */
function missing(base:BudgetValue):BudgetValue{
  const {availability:_,...rest}=base as BudgetValue&{cents?:number}
  delete rest.cents
  return {...rest,availability:'unavailable',reasons:[...new Set([...base.reasons,'details-missing' as const])]}
}
function meter(value:BudgetValue|null,max:BudgetValue|null){
  return known(value)&&known(max)&&max.cents>0?{value:Math.max(0,Math.min(value.cents,max.cents)),max:max.cents}:null
}

type Item=BudgetPresentation['items'][number]

function itemNote(item:Item,p:BudgetPresentation,openingNote:string|null):string|null{
  const c=item.config,parts:string[]=[]
  if(item.archived)parts.push('Archived · history preserved')
  else if(!c)parts.push('Finish setup')
  else if(c.state==='paused')parts.push('Paused')
  else if(c.state==='draft')parts.push(c.type==='goal'?'Draft · target not confirmed':'Draft')
  else if(c.state==='purchase-recorded')parts.push('Purchase recorded')
  else if(item.kind==='fixed'&&item.occurrences.length>0){
    // Same rule as Bills & commitments: dates only when recorded activity is current.
    const observed=known(p.actuals.net)&&p.actuals.net.freshness==='current'&&p.phase!=='future'
    const next=item.occurrences.find(o=>o.matched_cents<o.expected_cents)
    parts.push(!observed?'Recorded payments unavailable':next?`Due ${at(next.date)}`:'Paid')
  }else if(c.due_date)parts.push(`Needed by ${at(c.due_date,true)}`)
  if(openingNote)parts.push(openingNote)
  return parts.length?parts.join(' · '):null
}

/** Arranges presentation values into grouped rows. It never adds, nets or derives money. */
export function budgetSheet(p:BudgetPresentation,fmt:(cents:number)=>string):SheetGroup[]{
  const items=new Map(p.items.map(item=>[item.id,item]))
  const totals=new Map(p.sheet.groups.map(g=>[g.key,g]))
  const basis=p.sheet.allocated
  const rowsByGroup=new Map<BudgetSheetGroupKey,SheetRow[]>(GROUPS.map(g=>[g.key,[]]))
  for(const line of p.plan.lines){
    const item=items.get(line.id)
    const key:BudgetSheetGroupKey=item?.config?.type==='goal'?'goal':line.kind
    const opening=known(line.opening)&&line.opening.cents>0?`Existing reserve at setup: ${fmt(line.opening.cents)}. Separate from this allocation.`:null
    if(line.kind==='everyday'){
      const e=p.everyday,over=known(e.remaining)&&e.remaining.cents<0
      rowsByGroup.get('everyday')!.push({id:line.id,lineId:line.id,name:line.name,child:false,over,
        note:[line.archived?'Archived · history preserved':null,p.categoryMode==='limits'?'Shared total for the categories below':null,over&&known(e.remaining)?`Over by ${fmt(-e.remaining.cents)}`:null].filter(Boolean).join(' · ')||null,
        planned:e.planned,spent:e.spent,third:e.remaining,meter:meter(e.spent,e.planned)})
      if(p.categoryMode==='limits'){
        for(const c of [...p.categories,{...p.other,id:'other',name:'Other everyday spending'}]){
          const childOver=known(c.remaining)&&c.remaining.cents<0
          rowsByGroup.get('everyday')!.push({id:`category:${c.id}`,lineId:null,name:c.name,child:true,over:childOver,
            note:childOver&&known(c.remaining)?`Over by ${fmt(-c.remaining.cents)}`:null,
            planned:c.planned,spent:c.spent,third:c.remaining,meter:meter(c.spent,c.planned)})
        }
      }
      continue
    }
    if(!item){
      rowsByGroup.get(key)!.push({id:line.id,lineId:line.id,name:line.name,child:false,over:false,note:opening,
        planned:line.planned,spent:key==='contribution'?null:missing(basis),third:missing(basis),meter:null})
      continue
    }
    const third=key==='fixed'?item.remaining:key==='contribution'?item.bankConfirmed:item.reserve
    const over=key==='fixed'&&known(item.remaining)&&item.remaining.cents<0
    const note=[itemNote(item,p,opening),over&&known(item.remaining)?`Over by ${fmt(-item.remaining.cents)}`:null].filter(Boolean).join(' · ')||null
    rowsByGroup.get(key)!.push({id:line.id,lineId:line.id,name:line.name,child:false,over,note,
      planned:line.planned,spent:key==='fixed'?item.spent:key==='contribution'?null:item.purchases,third,
      meter:key==='fixed'?meter(item.spent,line.planned):key==='goal'?meter(item.reserve,item.target):null})
  }
  return GROUPS.flatMap(g=>{
    const rows=rowsByGroup.get(g.key)!
    if(!rows.length)return []
    const lines=rows.filter(r=>r.lineId).length,t=totals.get(g.key)
    const total=lines>1?t?{planned:t.planned,spent:g.key==='fixed'?t.spent:g.key==='contribution'?null:t.purchases,
      third:g.key==='fixed'?t.remaining:g.key==='contribution'?t.bankConfirmed:t.reserve}
      :{planned:missing(basis),spent:g.key==='contribution'?null:missing(basis),third:missing(basis)}:null
    return [{...g,rows,total}]
  })
}

export type SplitSegment = {key:BudgetSheetGroupKey|'unplanned';label:string;cents:number;percent:number}
/** Display ratios for the money split bar. Returns null unless every input is a known current amount. */
export function budgetSplit(p:BudgetPresentation):{segments:SplitSegment[];over:boolean;resourcesPercent:number}|null{
  const {expected,cashOnce,unallocated}=p.income,allocated=p.sheet.allocated
  if(!known(expected)||!known(cashOnce)||!known(unallocated)||!known(allocated)||!p.sheet.available)return null
  const parts=GROUPS.map(g=>({g,total:p.sheet.groups.find(x=>x.key===g.key)?.planned}))
  if(parts.some(x=>x.total&&!known(x.total)))return null
  const resources=expected.cents+cashOnce.cents
  // Widths only: the server's allocated total, never a client re-sum of the groups.
  const base=Math.max(resources,allocated.cents)
  if(base<=0)return null
  const label={fixed:'Bills',everyday:'Everyday',reserve:'Set aside',goal:'Goals',contribution:'Transfers'}
  const segments:SplitSegment[]=parts.filter(x=>known(x.total)&&x.total.cents>0).map(x=>({key:x.g.key,label:label[x.g.key],cents:(x.total as {cents:number}).cents,percent:(x.total as {cents:number}).cents/base*100}))
  if(unallocated.cents>0)segments.push({key:'unplanned',label:'No job yet',cents:unallocated.cents,percent:unallocated.cents/base*100})
  return {segments,over:unallocated.cents<0,resourcesPercent:resources/base*100}
}
