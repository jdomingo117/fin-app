import { describe, expect, it } from 'vitest'
import { budgetPresentation } from './budgetPresentation'
import { budgetSheet, budgetSplit } from './budgetSheet'
import { BUDGET_METHOD, type Snapshot } from './budgetWorkspace'
import type { BudgetItem } from './budgetItems'
import { fmtCents } from '../data'

const config=(type:'bill'|'reserve'|'goal'|'contribution',extra:Partial<NonNullable<BudgetItem['config']>>={})=>({type,name:type,target_cents:null,estimated:false,due_date:null,cadence:'monthly' as const,anchor:'2026-10-01',amount_cents:0,state:'saving' as const,recurring_id:null,planning_goal_id:null,...extra})
function item(line_id:string,kind:BudgetItem['kind'],patch:Partial<BudgetItem>={}):BudgetItem{
  return {line_id,name:line_id,kind,config:null,item_revision:null,opening_cents:0,opening_date:'2026-10-01',planned_cents:0,reallocated_cents:0,opening_carry_cents:0,
    remaining_cents:0,used_cents:0,reserve_cents:null,net_purchases_cents:0,bank_confirmed_cents:0,user_confirmed_cents:0,changed_claims:0,occurrences:[],...patch}
}
function fixture():Snapshot{
  const facts={period_id:'period',start_date:'2026-10-01',end_date:'2026-11-01',original_plan:{income_cents:600000,drawdown_cents:0,allocations:[]},latest_plan:{income_cents:600000,drawdown_cents:0,allocations:[]},
    actuals:{gross_expense_cents:200000,expense_credits_cents:0,net_expense_cents:200000,earned_income_cents:300000,pending_signed_cents:0},opening_carry_cents:0,closing_everyday_cents:0,scope_valid:true,coverage_complete:true,excluded_cents:0,unassigned_credit_cents:0}
  const lines=[
    {id:'everyday',name:'Everyday',kind:'everyday' as const,allocation_cents:180000,opening_cents:0},
    {id:'rent',name:'Rent',kind:'fixed' as const,allocation_cents:200000,opening_cents:0},
    {id:'phone',name:'Phone',kind:'fixed' as const,allocation_cents:6500,opening_cents:0},
    {id:'rego',name:'Car rego',kind:'reserve' as const,allocation_cents:6000,opening_cents:50000},
    {id:'trip',name:'Japan trip',kind:'reserve' as const,allocation_cents:30000,opening_cents:0},
    {id:'super',name:'Super top-up',kind:'contribution' as const,allocation_cents:10000,opening_cents:0},
  ]
  return {tenant_id:'tenant',source_revision:'7',method:BUDGET_METHOD,write_enabled:true,
    accounts:[{id:'account',name:'Activity',currency:'AUD'}],account_scope:[{original_account_id:'account',account_id:'account',role:'activity',start_date:'2026-10-01',end_date:null}],
    plan:{id:'plan',version:'3',currency:'AUD',timezone:'Australia/Sydney',frequency:'monthly',anchor:null},
    period:{id:'period',start_date:'2026-10-01',end_date:'2026-11-01',timezone:'Australia/Sydney',frequency:'monthly'},
    revision:{income_cents:600000,drawdown_cents:10000},lines,scope_valid:true,coverage_complete:true,actuals:facts.actuals,unallocated_cents:177500,generated_at:'2026-10-19T10:00:00Z',
    details:{source_revision:'7',plan_version:'3',undo_operation_id:null,taxonomy:[{id:'groceries',name:'Groceries'}],taxonomy_scopes:[],planning_goals:[],recurring:[],claims:[],
      items:[
        item('everyday','everyday',{planned_cents:180000,used_cents:151000,remaining_cents:29000}),
        item('rent','fixed',{config:config('bill'),planned_cents:200000,used_cents:200000,remaining_cents:0,occurrences:[{date:'2026-10-01',expected_cents:200000,matched_cents:200000}]}),
        item('phone','fixed',{config:config('bill'),planned_cents:6500,used_cents:7000,remaining_cents:-500,occurrences:[{date:'2026-10-18',expected_cents:6500,matched_cents:0}]}),
        item('rego','reserve',{config:config('reserve',{due_date:'2027-03-01'}),planned_cents:6000,reserve_cents:56000}),
        item('trip','reserve',{config:config('goal',{target_cents:500000}),planned_cents:30000,reserve_cents:210000}),
        item('super','contribution',{config:config('contribution'),planned_cents:10000,bank_confirmed_cents:10000}),
      ],
      limits:[],other_flexible_cents:0,other_flexible_used_cents:0,other_opening_carry_cents:0,other_flexible_remaining_cents:0,excluded_cents:0,unassigned_credit_cents:0,
      sheet:{allocated_cents:432500,groups:[
        {key:'fixed',count:2,planned_cents:206500,used_cents:207000,remaining_cents:-500,reserve_cents:null,purchases_cents:0,bank_confirmed_cents:0},
        {key:'everyday',count:1,planned_cents:180000,used_cents:151000,remaining_cents:29000,reserve_cents:null,purchases_cents:0,bank_confirmed_cents:0},
        {key:'reserve',count:1,planned_cents:6000,used_cents:0,remaining_cents:0,reserve_cents:56000,purchases_cents:0,bank_confirmed_cents:0},
        {key:'goal',count:1,planned_cents:30000,used_cents:0,remaining_cents:0,reserve_cents:210000,purchases_cents:0,bank_confirmed_cents:0},
        {key:'contribution',count:1,planned_cents:10000,used_cents:0,remaining_cents:0,reserve_cents:null,purchases_cents:0,bank_confirmed_cents:10000},
      ]},
      lifecycle:{state:'current',as_of:'2026-10-19',carry_mode:'fresh',provisional_carry:false,chain_valid:true,facts,review:null,changed_since_review:false,previous_id:null,next_id:null,is_latest:true,periods:[]}}
  } as Snapshot
}
const cents=(v:{availability:string;cents?:number}|null)=>v&&v.availability==='known'?v.cents:v?'unavailable':null

describe('budget table rows',()=>{
  it('shows every saved line exactly once, grouped in a fixed order',()=>{
    const groups=budgetSheet(budgetPresentation(fixture()),fmtCents)
    expect(groups.map(g=>g.key)).toEqual(['fixed','everyday','reserve','goal','contribution'])
    const ids=groups.flatMap(g=>g.rows.map(r=>r.lineId)).filter(Boolean)
    expect(ids.sort()).toEqual(['everyday','phone','rego','rent','super','trip'])
  })
  it('uses the server group total only for groups with more than one line',()=>{
    const groups=budgetSheet(budgetPresentation(fixture()),fmtCents)
    const bills=groups.find(g=>g.key==='fixed')!
    expect(cents(bills.total!.planned)).toBe(206500);expect(cents(bills.total!.third)).toBe(-500)
    expect(groups.find(g=>g.key==='goal')!.total).toBeNull()
  })
  it('labels bills by their dates and an overage by its amount',()=>{
    const rows=budgetSheet(budgetPresentation(fixture()),fmtCents).find(g=>g.key==='fixed')!.rows
    expect(rows.find(r=>r.id==='rent')!.note).toBe('Paid')
    const phone=rows.find(r=>r.id==='phone')!
    expect(phone.over).toBe(true);expect(phone.note).toBe('Due 18 Oct · Over by $5.00')
  })
  it('separates goals from set-asides and keeps the setup reserve note',()=>{
    const groups=budgetSheet(budgetPresentation(fixture()),fmtCents)
    const rego=groups.find(g=>g.key==='reserve')!.rows[0],trip=groups.find(g=>g.key==='goal')!.rows[0]
    expect(rego.note).toContain('Existing reserve at setup: $500.00');expect(cents(rego.third)).toBe(56000)
    expect(trip.id).toBe('trip');expect(trip.meter).toEqual({value:210000,max:500000})
    expect(groups.find(g=>g.key==='contribution')!.rows[0].spent).toBeNull()
  })
  it('never turns a missing group total into zero',()=>{
    const s=fixture();s.details!.sheet!.groups[0].planned_cents=null
    const bills=budgetSheet(budgetPresentation(s),fmtCents).find(g=>g.key==='fixed')!
    expect(cents(bills.total!.planned)).toBe('unavailable')
  })
  it('keeps rows when details are missing, with only saved plan amounts known',()=>{
    const s=fixture();delete s.details
    const groups=budgetSheet(budgetPresentation(s),fmtCents)
    const rent=groups.find(g=>g.key==='fixed')!.rows.find(r=>r.id==='rent')!
    expect(cents(rent.planned)).toBe(200000);expect(cents(rent.third)).toBe('unavailable')
    expect(groups.find(g=>g.key==='fixed')!.total!.planned.availability).toBe('unavailable')
  })
  it('lists category limits under the shared everyday line',()=>{
    const s=fixture();s.details!.limits=[{id:'limit',category_id:'groceries',subcategory_id:null,custom_subcategory_id:null,amount_cents:70000,used_cents:76000,remaining_cents:-6000,opening_carry_cents:0}]
    const rows=budgetSheet(budgetPresentation(s),fmtCents).find(g=>g.key==='everyday')!.rows
    expect(rows.map(r=>r.name)).toEqual(['Everyday','Groceries','Other everyday spending'])
    expect(rows[1]).toMatchObject({child:true,lineId:null,over:true,note:'Over by $60.00'})
  })
})

describe('row explanations',()=>{
  it('states the everyday identity with the server figures, adding carry only when it exists',()=>{
    const s=fixture(),row=s.details!.items[0];row.opening_carry_cents=-10000;row.reallocated_cents=5000;row.remaining_cents=24000
    const e=budgetSheet(budgetPresentation(s),fmtCents).find(g=>g.key==='everyday')!.rows[0]
    expect(e.explain[0]).toBe('Left $240.00 = planned $1,800.00 + carried over -$100.00 + moved in $50.00 − spent $1,510.00.')
    expect(e.pace).toBe(true)
    const plain=budgetSheet(budgetPresentation(fixture()),fmtCents).find(g=>g.key==='everyday')!.rows[0]
    expect(plain.explain[0]).toBe('Left $290.00 = planned $1,800.00 − spent $1,510.00.')
  })
  it('lists category parts without claiming an equation',()=>{
    const s=fixture();s.details!.limits=[{id:'limit',category_id:'groceries',subcategory_id:null,custom_subcategory_id:null,amount_cents:70000,used_cents:76000,remaining_cents:-6000,opening_carry_cents:0}]
    const child=budgetSheet(budgetPresentation(s),fmtCents).find(g=>g.key==='everyday')!.rows[1]
    expect(child.explain[0]).toBe('Planned $700.00 · spent $760.00 · left -$60.00, including any moves between categories.')
  })
  it('explains bills, goals and transfers in their own terms',()=>{
    const groups=budgetSheet(budgetPresentation(fixture()),fmtCents)
    expect(groups.find(g=>g.key==='fixed')!.rows[0].explain[0]).toBe('Planned $2,000.00 · matched payments so far $2,000.00 · left $0.00.')
    expect(groups.find(g=>g.key==='goal')!.rows[0].explain[0]).toBe('Saved so far $2,100.00 of $5,000.00 · planned this budget $300.00.')
    expect(groups.find(g=>g.key==='contribution')!.rows[0].explain[0]).toBe('Planned $100.00 · matched to bank transfers $100.00.')
    expect(groups.find(g=>g.key==='fixed')!.rows[0].pace).toBe(false)
  })
  it('says why a figure is qualified',()=>{
    const s=fixture();s.coverage_complete=false
    const e=budgetSheet(budgetPresentation(s),fmtCents).find(g=>g.key==='everyday')!.rows[0]
    expect(e.explain.at(-1)).toBe('About these figures: Known activity only.')
  })
})

describe('money split bar',()=>{
  it('shares expected money between groups and the unplanned remainder',()=>{
    const split=budgetSplit(budgetPresentation(fixture()))!
    expect(split.over).toBe(false)
    expect(split.segments.map(s=>s.key)).toEqual(['fixed','everyday','reserve','goal','contribution','unplanned'])
    expect(split.segments.reduce((a,s)=>a+s.percent,0)).toBeCloseTo(100,6)
  })
  it('scales to the plan when it is bigger than the money expected',()=>{
    const s=fixture();s.unallocated_cents=-100000;s.details!.sheet!.allocated_cents=710000
    const split=budgetSplit(budgetPresentation(s))!
    expect(split.over).toBe(true);expect(split.segments.some(x=>x.key==='unplanned')).toBe(false)
    expect(split.resourcesPercent).toBeCloseTo(610000/710000*100,6)
  })
  it('is not drawn when any total is unavailable',()=>{
    const s=fixture();s.details!.sheet!.groups[1].planned_cents=null
    expect(budgetSplit(budgetPresentation(s))).toBeNull()
    const t=fixture();delete t.details!.sheet
    expect(budgetSplit(budgetPresentation(t))).toBeNull()
  })
})
