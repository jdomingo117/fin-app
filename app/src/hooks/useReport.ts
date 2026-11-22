import { useLayoutEffect, useReducer, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'

interface State<T> {key:string; scope:string; data:T|null; error:boolean; pending:boolean}
export function useReport<T>(params:unknown, read:(tenant:string)=>Promise<T>, enabled=true, keepDuringRefresh=false) {
  const {user,tenantId} = useAuth()
  const {reportRevision} = useData()
  const [attempt,retry] = useReducer((n:number)=>n+1,0)
  const scope = JSON.stringify([user?.id, tenantId, params, enabled])
  const key = JSON.stringify([scope, reportRevision])
  const generation = useRef(0)
  const loader = useRef(read)
  useLayoutEffect(()=>{loader.current=read})
  const [state,setState] = useState<State<T>>({key,scope,data:null,error:false,pending:true})
  const pending = (old: State<T>): State<T> => ({
    key, scope,
    data: old.key === key || (keepDuringRefresh && old.scope === scope) ? old.data : null,
    error: false, pending: true,
  })
  useLayoutEffect(()=>{
    const request = ++generation.current
    setState(pending)
    if (enabled && user?.id && tenantId) {
      loader.current(tenantId).then(data=>{
        if (generation.current===request) setState({key,scope,data,pending:false,error:false})
      }).catch(()=>{
        if (generation.current===request) setState(old=>({...old,pending:false,error:true}))
      })
    }
    return ()=>{generation.current++}
  },[key,scope,user?.id,tenantId,reportRevision,attempt,enabled,keepDuringRefresh])
  return {...(state.key===key ? state : pending(state)),retry}
}
