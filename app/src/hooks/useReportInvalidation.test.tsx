// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReport } from './useReport'
import { completePages } from '../lib/scopedPages'

const {auth,revision} = vi.hoisted(()=>({auth:{user:{id:'same-user'},tenantId:'a'},revision:{reportRevision:0}}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>auth}))
vi.mock('../contexts/DataContext',()=>({useData:()=>revision}))
function deferred<T>() { let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve} }
let root:Root
let current:ReturnType<typeof useReport<string[]>>
let commits:typeof current[]
let requests:ReturnType<typeof deferred<string[]>>[]
const read=vi.fn(async()=>{const d=deferred<string[]>();requests.push(d);return d.promise})
function Probe({ params, keepDuringRefresh }: { params: string; keepDuringRefresh: boolean }) {
  const report = useReport(params, read, true, keepDuringRefresh)
  useLayoutEffect(() => { current = report; commits.push(report) }, [report])
  return null
}
async function render(params = 'evidence', keepDuringRefresh = false) {
  await act(async () => { root.render(<Probe params={params} keepDuringRefresh={keepDuringRefresh} />) })
}
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);root=createRoot(document.createElement('div'));requests=[];commits=[];read.mockClear();auth.tenantId='a';revision.reportRevision=0})
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals()})
describe('scoped response publication',()=>{
  it('keeps a previous result only while refreshing the same identity and params', async () => {
    await render('recent', true)
    await act(async () => requests[0].resolve(['cached']))
    revision.reportRevision++
    await render('recent', true)
    expect(current).toMatchObject({ data: ['cached'], pending: true })
    await act(async () => requests[1].resolve(['edited']))
    expect(current.data).toEqual(['edited'])

    await render('different scope', true)
    expect(current.data).toBeNull()
    await act(async () => requests[2].resolve(['other result']))
    auth.tenantId = 'b'
    await render('different scope', true)
    expect(current.data).toBeNull()
  })
  it.each(['mutation','tenant switch'])('rejects a pre-edit page after %s',async boundary=>{
    await render()
    const old=requests[0]
    if(boundary==='mutation')revision.reportRevision++;else auth.tenantId='b'
    await render()
    expect(current.data).toBeNull()
    await act(async()=>requests[1].resolve(['new']))
    const count=commits.length
    await act(async()=>old.resolve(['pre-edit']))
    expect(current.data).toEqual(['new'])
    expect(commits).toHaveLength(count)
  })
  it('never publishes an old accumulated evidence prefix when its last page finishes after invalidation',async()=>{
    const oldPage=deferred<{rows:string[];next:number|null}>()
    let pass=0
    read.mockImplementationOnce(async()=>completePages(async(cursor:number|null)=>{
      pass++
      return cursor===null ? {rows:['old-first-page'],next:1} : oldPage.promise
    }))
    await render()
    expect(pass).toBe(2)
    expect(current.data).toBeNull()
    revision.reportRevision++
    await render()
    await act(async()=>requests[0].resolve(['edited-first-page','edited-last-page']))
    await act(async()=>oldPage.resolve({rows:['old-last-page'],next:null}))
    expect(current.data).toEqual(['edited-first-page','edited-last-page'])
  })
})
