// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi} from 'vitest'
import {useReport} from './useReport'
import {safeInteger} from '../lib/reports'
const auth = vi.hoisted(()=>({user:{id:'u'} as {id:string}|null, tenantId:'a'}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>auth}))
vi.mock('../contexts/DataContext',()=>({useData:()=>({reportRevision:0})}))
vi.mock('../lib/supabaseClient',()=>({supabase:{}}))
it('accepts exact signed cents up to the safe boundaries',()=>{
  expect(safeInteger('-9007199254740991')).toBe(-Number.MAX_SAFE_INTEGER)
  for (const bad of ['9007199254740992','-9007199254740992','1.2','',null,1.2]) expect(()=>safeInteger(bad)).toThrow()
})
it('isolates successive requests, identities and failures',async()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  const root=createRoot(document.createElement('div'))
  const requests:{resolve:(n:number)=>void;reject:()=>void}[]=[]
  let result!:ReturnType<typeof useReport<number>>
  function Probe(){
    result=useReport([],()=>new Promise<number>((resolve,reject)=>requests.push({resolve,reject})))
    return null
  }
  const render=()=>act(async()=>root.render(<Probe/>))
  await render()
  await act(async()=>requests[0].reject())
  expect(result).toMatchObject({data:null,error:true})
  await act(async()=>result.retry())
  await act(async()=>requests[1].resolve(42))
  await act(async()=>result.retry())
  await act(async()=>requests[2].reject())
  expect(result).toMatchObject({data:42,error:true})
  await act(async()=>result.retry())
  await act(async()=>result.retry())
  await act(async()=>requests[4].resolve(84))
  await act(async()=>requests[3].resolve(21))
  expect(result.data).toBe(84)
  auth.tenantId='b'
  await render()
  expect(result.data).toBeNull()
  auth.user=null
  await render()
  await act(async()=>requests[5].resolve(5))
  expect(result.data).toBeNull()
  await act(async()=>root.unmount())
})
