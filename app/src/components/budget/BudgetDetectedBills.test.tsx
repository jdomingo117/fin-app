// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { buildRecurring } from '../../lib/recurring'
import type { AssistanceResult } from '../../lib/budgetAssistance'
import type { Txn } from '../../data'
import BudgetDetectedBills from './BudgetDetectedBills'
const {state,invoke,refresh} = vi.hoisted(()=>({state:{data:null as ReturnType<typeof buildRecurring>|null},invoke:vi.fn(),refresh:vi.fn()}))
vi.mock('../../hooks/useRecurrence',()=>({useRecurrence:()=>({...state,pending:false,error:false,retry:()=>{}})}))
vi.mock('../../contexts/DataContext',()=>({useData:()=>({refreshData:refresh})}))
vi.mock('../../contexts/BudgetContext',()=>({useBudget:()=>({refresh:async()=>{},canWrite:true})}))
vi.mock('../../lib/supabaseClient',()=>({supabase:{functions:{invoke}}}))
const today='2026-08-10'
const evidence=['2026-05-03','2026-06-03','2026-07-03','2026-08-03'].map((date,i)=>({id:`t${i}`,date,amount:-1599,merchant:'Netflix',merchantKey:'netflix',kind:'expense',cat:'Lifestyle',account_id:'a'}) as Txn)
let root:Root,container:HTMLDivElement
const added=vi.fn(),removed=vi.fn()
beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);container=document.createElement('div');root=createRoot(container)
  state.data=buildRecurring(evidence,[],today);added.mockClear();removed.mockClear();invoke.mockReset()
  invoke.mockResolvedValueOnce({data:{event_id:'saved-event'},error:null}).mockResolvedValue({error:null})
  refresh.mockReset().mockImplementation(async()=>{state.data=buildRecurring([],[],today)})
})
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals()})
async function accept(){
  await act(async()=>root.render(<BudgetDetectedBills result={{account_ids:['a'],recurring:[]} as unknown as AssistanceResult} accountName={()=>'Cash'} activity={[]} today={today} onAdded={added} onRemoved={removed}/>))
  const button=container.querySelector<HTMLButtonElement>('button[aria-label="Add as a bill: Netflix"]')!
  await act(async()=>button.click())
}
it('keeps guarded Undo after refreshed evidence removes the accepted suggestion',async()=>{
  await accept()
  expect(added).toHaveBeenCalledWith(['a|netflix'])
  expect(container.textContent).toContain('Added Netflix as a bill.')
  expect(container.querySelector('button[aria-label="Add as a bill: Netflix"]')).toBeNull()
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Undo adding Netflix"]')!.click())
  expect(invoke).toHaveBeenLastCalledWith('manage-recurring-series',{body:{action:'undo',event_id:'saved-event'}})
  expect(removed).toHaveBeenCalledWith(['a|netflix'])
  expect(container.textContent).toBe('')
})
it('retains the receipt and accepted key when guarded Undo fails',async()=>{
  await accept();refresh.mockClear();invoke.mockResolvedValueOnce({error:Error('Changed since acceptance')})
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Undo adding Netflix"]')!.click())
  expect(container.textContent).toContain('Changed since acceptance')
  expect(container.querySelector('button[aria-label="Undo adding Netflix"]')).not.toBeNull()
  expect(removed).not.toHaveBeenCalled();expect(refresh).not.toHaveBeenCalled()
})
