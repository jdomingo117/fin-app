import {renderToStaticMarkup} from 'react-dom/server'
import {StaticRouter} from 'react-router-dom'
import {expect,it,vi} from 'vitest'
import Dashboard from './Dashboard'

vi.mock('../router',()=>({useView:()=>({})}))
vi.mock('../contexts/DataContext',()=>({useData:()=>({accounts:[],transactions:[{amount:99999999,date:'2026-11-20'}]})}))
vi.mock('../lib/supabaseClient',()=>({supabase:{}}))
vi.mock('../hooks/usePortfolio',()=>({usePortfolio:()=>({data:{net_worth_cents:100}})}))
vi.mock('../hooks/useReport',()=>({useReport:(key:unknown)=>key==='monthly'
  ? {data:null,error:true,retry:()=>{}}
  : {data:key==='recent' ? [] : {periods:{current:{},prior:{}},categories:[]}}}))
vi.mock('../components/charts/Area',()=>({default:()=> <p>Monthly series plotted</p>}))
vi.mock('../components/TransactionCategoryDrawer',()=>({default:()=>null}))
vi.mock('../components/HeroCard',()=>({default:()=>null}))
it('renders retry instead of reconstructing a monthly chart from available transactions',()=>{
  const html=renderToStaticMarkup(<StaticRouter location="/dashboard"><Dashboard/></StaticRouter>)
  expect(html).toContain('Net worth history unavailable')
  expect(html).toContain('Retry')
  expect(html).not.toContain('Monthly series plotted')
})
