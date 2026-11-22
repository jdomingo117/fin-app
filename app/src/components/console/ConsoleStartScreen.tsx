import { useLayoutEffect, useRef, useState } from 'react'
import { consoleDuration } from './motion'
import './console-start-screen.css'

export function ConsoleStartScreen({ reduced, onStart, onFinish }: {
  reduced: boolean
  onStart: () => void
  onFinish: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [leaving, setLeaving] = useState(false)

  useLayoutEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])

  useLayoutEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(onFinish, consoleDuration[reduced ? 'reduced' : 'start'])
    return () => window.clearTimeout(timer)
  }, [leaving, reduced, onFinish])

  return <dialog ref={dialog} aria-label="Halcyon start screen" className="console-start-screen"
    data-leaving={leaving} onCancel={event => event.preventDefault()}>
    <div className="console-start-body">
      <h1 className="console-start-wordmark">
        <span className="sr-only">Halcyon</span>
        <span aria-hidden="true" className="console-start-wide">Halcyon</span>
        <span aria-hidden="true" className="console-start-settled">Halcyon</span>
      </h1>
      <button type="button" aria-disabled={leaving} autoFocus onClick={() => {
        if (leaving) return
        onStart()
        setLeaving(true)
      }}>Press Enter or click to start</button>
    </div>
  </dialog>
}
