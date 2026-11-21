import { useLayoutEffect, useReducer, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'

interface State<T> {key:string;data:T|null; error:boolean; pending:boolean}
export function useReport<T>(params:unknown, read:(tenant:string)=>Promise<T>, enabled=true) {
  const {user,tenantId} = useAuth()
  const {reportRevision} = useData()
  const [attempt,retry] = useReducer((n:number)=>n+1,0)
  const key = JSON.stringify([user?.id,tenantId,params,enabled])
  const generation = useRef(0)
  const loader = useRef(read)
  useLayoutEffect(()=>{loader.current=read})
  const [state,setState] = useState<State<T>>({key,data:null,error:false,pending:true})
  useLayoutEffect(()=>{
    const request = ++generation.current
    setState(old=>({key,data:old.key===key ? old.data : null,error:false,pending:true}))
    if (enabled && user?.id && tenantId) {
      loader.current(tenantId).then(data=>{
        if (generation.current===request) setState({key,data,pending:false,error:false})
      }).catch(()=>{
        if (generation.current===request) setState(old=>({...old,pending:false,error:true}))
      })
    }
    return ()=>{generation.current++}
  },[key,user?.id,tenantId,reportRevision,attempt,enabled])
  return {...(state.key===key ? state : {data:null,error:false,pending:true}),retry}
}
