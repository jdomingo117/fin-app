import { describe, expect, it, vi } from 'vitest'
vi.mock('./supabaseClient',()=>({supabase:{}}))
import { shiftedDay } from './recurrenceScope'
import { buildRecurring } from './recurring'
import type { Account, Txn } from '../data'

describe('scoped recurrence evidence and monetary facts',()=>{
  it('keeps leap-year inclusive annual evidence separate from ordinary reporting',()=>{
    const today='2026-11-21'
    expect(shiftedDay(today,-364)).toBe('2025-11-22')
    expect(shiftedDay(today,-3*366)).toBe('2023-11-19')
    const dates=['2023-11-21','2024-11-21','2025-11-21','2026-11-21']
    const transactions:Txn[]=dates.map((date,i)=>({id:String(i),date,amount:-12000,account_id:'a',account:'Cash',merchant:'Annual cover',merchantKey:'annual cover',cat:'Insurance',kind:'expense'}))
    // SQL is authoritative for money, even if supplied evidence differs.
    const facts={groups:new Map([[JSON.stringify(['a','annual cover']),{trailing:12000,pressure:12000}]]),totalPressure:21000}
    const result=buildRecurring(transactions,[{id:'a',name:'Cash',type:'Liquid',balance:0,glow:'cyan'} as Account],today,new Map(),[],facts)
    expect(result.active).toHaveLength(1)
    expect(result.active[0].cadence).toBe('Annual')
    expect(result.active[0].charges.map(c=>c.transactionId)).toEqual(['0','1','2','3'])
    expect(result.trailingActual).toBe(12000)
    expect(result.pressure).toEqual({recurring:12000,total:21000,ratio:12000/21000})
  })
})
