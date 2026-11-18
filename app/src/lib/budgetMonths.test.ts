import { describe, expect, it } from 'vitest'
import { budgetMonthsRows, type BudgetMonths, type BudgetMonthsLine } from './budgetMonths'

const line=(id:string,patch:Partial<BudgetMonthsLine>={}):BudgetMonthsLine=>({line_id:id,name:id,kind:'everyday',goal:false,archived:false,planned_cents:60000,used_cents:41200,remaining_cents:18800,reserve_cents:null,target_cents:null,...patch})
const months=(periods:BudgetMonthsLine[][]):BudgetMonths=>({plan_id:'p',period_id:'b',source_revision:'1',plan_version:'1',periods:periods.map((lines,i)=>({period_id:`m${i}`,start_date:`2026-${String(9+i).padStart(2,'0')}-01`,end_date:`2026-${String(10+i).padStart(2,'0')}-01`,lines}))})

describe('month by month rows',()=>{
  it('lists every line once in group order, named as in its latest budget',()=>{
    const rows=budgetMonthsRows(months([[line('e'),line('rent',{kind:'fixed',name:'Old rent'})],[line('e'),line('rent',{kind:'fixed',name:'Rent'}),line('trip',{kind:'reserve',goal:true,reserve_cents:210000,target_cents:500000})]]))
    expect(rows.map(r=>[r.group,r.name])).toEqual([['fixed','Rent'],['everyday','e'],['goal','trip']])
  })
  it('marks a line absent before it existed, never zero',()=>{
    const rows=budgetMonthsRows(months([[line('e')],[line('e'),line('new',{kind:'fixed'})]]))
    expect(rows.find(r=>r.id==='new')!.cells[0]).toEqual({state:'absent'})
  })
  it('shows used of planned with an over flag from the server balance',()=>{
    const [r]=budgetMonthsRows(months([[line('e',{used_cents:70000,remaining_cents:-10000})]]))
    expect(r.cells[0]).toEqual({state:'known',main:70000,of:60000,over:true,ratio:70000/60000})
  })
  it('shows saved so far against a goal target and keeps unknown values unavailable',()=>{
    const rows=budgetMonthsRows(months([[line('trip',{kind:'reserve',goal:true,reserve_cents:210000,target_cents:500000}),line('e',{used_cents:null})]]))
    expect(rows.find(r=>r.id==='trip')!.cells[0]).toEqual({state:'known',main:210000,of:500000,over:false,ratio:0.42})
    expect(rows.find(r=>r.id==='e')!.cells[0]).toEqual({state:'unavailable'})
  })
})
