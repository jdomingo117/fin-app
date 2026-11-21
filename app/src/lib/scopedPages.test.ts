import { describe, expect, it } from 'vitest'
import { completePages } from './scopedPages'

describe('complete evidence scopes',()=>{
  it('collects all stable pages past the PostgREST cap',async()=>{
    const source=Array.from({length:1507},(_,i)=>i)
    const cursors:(number|null)[]=[]
    const result=await completePages(async(cursor:number|null)=>{
      cursors.push(cursor)
      const rows=source.slice(cursor ?? 0,(cursor ?? 0)+500)
      return {rows,next:rows.length===500 ? rows.at(-1)!+1 : null}
    })
    expect(result).toEqual(source)
    expect(cursors).toEqual([null,500,1000,1500])
  })
  it('rejects the entire scope when a later evidence page fails',async()=>{
    let published:number[]|undefined
    await expect(completePages(async(cursor:number|null)=>{
      if(cursor!==null)throw Error('Evidence page failed')
      return {rows:[1,2,3],next:3}
    }).then(rows=>{published=rows})).rejects.toThrow('Evidence page failed')
    expect(published).toBeUndefined()
  })
})
