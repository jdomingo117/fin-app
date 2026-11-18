import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BudgetEditTable from './BudgetEditTable'
import type { Setup } from '../../lib/budgetWorkspace'

const setup={frequency:'monthly',start_date:'2026-11-01',timezone:'Australia/Sydney',account_ids:[],income_cents:600000,opening_drawdown_cents:0,
  lines:[{id:'e',kind:'everyday',name:'Everyday',allocation_cents:190000,opening_cents:0},{id:'r',kind:'fixed',name:'Rent',allocation_cents:200000,opening_cents:0},
    {id:'g',kind:'reserve',name:'Trip',allocation_cents:30000,opening_cents:0},{id:'c',kind:'reserve',name:'Rego',allocation_cents:6000,opening_cents:5000}]} as unknown as Setup
const render=(active:boolean)=>renderToStaticMarkup(<BudgetEditTable setup={setup} active={active} saved={new Map([['e',180000],['r',200000],['g',30000],['c',6000]])} goals={new Set(['g'])} onLine={()=>{}} onRemove={()=>{}}/>)

describe('editable plan table',()=>{
  it('keeps the existing field labels and groups goals apart from set-asides',()=>{
    const html=render(true)
    for(const name of ['Everyday','Rent','Trip','Rego'])expect(html).toContain(`aria-label="Planned for ${name} (AUD)"`)
    expect([...html.matchAll(/data-sheet-group="(\w+)"/g)].map(m=>m[1])).toEqual(['fixed','everyday','reserve','goal'])
  })
  it('shows what changed against the saved plan, without saving anything',()=>{
    const html=render(true)
    expect(html).toContain('Changed from $1,800.00');expect(html).toContain('Saved $2,000.00')
    expect(html.match(/budget-sheet-changed/g)).toHaveLength(1)
    expect(html).not.toContain('Remove ')
  })
  it('lets setup rename, remove and record existing reserves',()=>{
    const html=render(false)
    expect(html).toContain('aria-label="Allowance name · Regular bills"');expect(html).toContain('Remove Rent')
    expect(html).toContain('aria-label="Already set aside for Rego (AUD)"');expect(html).not.toContain('Remove Everyday')
  })
})

import { BudgetDraftTable } from './BudgetEditTable'
describe('assisted draft sources',()=>{
  it('shows each row’s source in setup and in the review table',()=>{
    const sources=new Map([['e','From your history'],['r','Detected bill'],['g','Your number'],['c','Kept as it was']])
    const edit=renderToStaticMarkup(<BudgetEditTable setup={setup} active={false} saved={new Map()} goals={new Set()} sources={sources} onLine={()=>{}} onRemove={()=>{}}/>)
    expect(edit).toContain('Everyday spending · From your history');expect(edit).toContain('data-line-source="Your number"')
    const draft=renderToStaticMarkup(<BudgetDraftTable setup={setup} sources={sources} goalLine="g"/>)
    expect(draft).toContain('Where it came from');expect(draft.match(/data-draft-line=/g)).toHaveLength(4)
    expect([...draft.matchAll(/data-sheet-group="(\w+)"/g)].map(m=>m[1])).toEqual(['fixed','everyday','reserve','goal'])
  })
})
