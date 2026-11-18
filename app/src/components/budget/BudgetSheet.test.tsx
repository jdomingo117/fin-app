import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BudgetSheet from './BudgetSheet'
import type { BudgetPresentation, BudgetValue } from '../../lib/budgetPresentation'

const q={basis:'plan',coverage:'complete',freshness:'current',provisional:false,reasons:[],provenance:{}} as const
const known=(cents:number)=>({...q,availability:'known',cents}) as unknown as BudgetValue
const unknown=()=>({...q,availability:'unavailable',reasons:['missing-field']}) as unknown as BudgetValue
function presentation(unallocated:number,allocated:BudgetValue=known(410000)):BudgetPresentation{
  const item=(id:string,kind:string,patch:object={})=>({id,name:id,kind,config:{type:kind==='fixed'?'bill':kind,state:'saving',due_date:null},archived:false,planned:known(10000),spent:known(0),remaining:known(10000),reserve:known(0),purchases:known(0),bankConfirmed:known(0),userConfirmed:known(0),target:known(0),occurrences:[],...patch})
  return {phase:'current',categoryMode:'pool',categories:[],
    everyday:{planned:known(200000),spent:known(150000),remaining:known(50000),carry:known(0),rightsMoved:known(0)},other:{},
    income:{expected:known(400000),cashOnce:known(0),unallocated:known(unallocated)},
    actuals:{net:known(150000)},
    plan:{lines:[{id:'everyday',name:'Everyday',kind:'everyday',planned:known(200000),opening:known(0),archived:false},
      {id:'rent',name:'Rent',kind:'fixed',planned:known(200000),opening:known(0),archived:false},
      {id:'phone',name:'Phone',kind:'fixed',planned:known(10000),opening:known(0),archived:false}]},
    items:[item('rent','fixed',{planned:known(200000),spent:known(200000),remaining:known(0)}),item('phone','fixed')],
    sheet:{available:true,allocated,groups:[{key:'fixed',count:2,planned:known(210000),spent:known(200000),remaining:known(10000),reserve:known(0),purchases:known(0),bankConfirmed:known(0)},
      {key:'everyday',count:1,planned:known(200000),spent:known(150000),remaining:known(50000),reserve:known(0),purchases:known(0),bankConfirmed:known(0)}]},
  } as unknown as BudgetPresentation
}

describe('My plan table',()=>{
  it('renders a real table with row headers, saved-line hooks and the plan equation',()=>{
    const html=renderToStaticMarkup(<BudgetSheet presentation={presentation(-10000)}/>)
    expect(html).toContain('<table');expect(html).toContain('<caption')
    expect(html.match(/data-plan-line="/g)).toHaveLength(3)
    expect(html).toContain('Total bills and regular payments')
    expect(html).toContain('data-budget-value="plan-allocated"')
    expect(html).toContain('Funding gap')
    expect(html).toContain('$4,000.00 income, minus $4,100.00 planned, leaves $100.00 more than you expect.')
    expect(html).toContain('Choose an item’s name to see how its numbers are worked out.')
    expect(html).toContain('aria-controls="budget-sheet-fx"')
  })
  it('marks a known but qualified figure and explains the mark',()=>{
    const p=presentation(5000)
    ;(p.everyday as unknown as {spent:BudgetValue}).spent={...known(150000),reasons:['partial-history']} as unknown as BudgetValue
    const html=renderToStaticMarkup(<BudgetSheet presentation={p}/>)
    expect(html.match(/budget-sheet-flag/g)).toHaveLength(1)
    expect(html).toContain('This figure may be incomplete. Choose the item to see why.')
  })
  it('says why the split is missing instead of drawing a partial bar',()=>{
    const html=renderToStaticMarkup(<BudgetSheet presentation={presentation(-10000,unknown())}/>)
    expect(html).toContain('The money split isn’t available')
    expect(html).not.toContain('budget-split-bar')
    expect(html).toContain('Funding gap')
  })
  it('draws the even-pace tick on everyday rows in a current period only',()=>{
    const p=presentation(5000)
    ;(p as unknown as {period:object}).period={id:'p',start:'2026-11-01',endExclusive:'2026-12-01',timezone:'Australia/Sydney',frequency:'monthly',transition:false,asOf:'2026-11-12'}
    const html=renderToStaticMarkup(<BudgetSheet presentation={p}/>)
    expect(html.match(/budget-sheet-pace"/g)).toHaveLength(1)
    expect(html).toMatch(/left:(36\.66|40)/)
    ;(p as unknown as {phase:string}).phase='past'
    expect(renderToStaticMarkup(<BudgetSheet presentation={p}/>)).not.toContain('budget-sheet-pace"')
  })
})
