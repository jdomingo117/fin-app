import { createContext, useContext, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { ConsoleHandoff, ConsoleHomeButton, type ConsoleEntry } from './ConsoleHub'
import { useConsoleReducedMotion } from './motion'
import './console-workflow.css'

const StatusSlot = createContext<{ target: HTMLDivElement | null; origin?: ConsoleEntry['origin'] } | null>(null)

export function WorkflowHub({ title, closing, headingRef, entry, onBack, children }: {
  title: string
  closing: boolean
  headingRef: Ref<HTMLHeadingElement>
  entry?: ConsoleEntry
  onBack: () => void
  children: ReactNode
}) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  const reduced = useConsoleReducedMotion()
  const origin = reduced ? undefined : entry?.origin
  return <StatusSlot.Provider value={{ target, origin }}>
    <header className="console-hub-heading console-workflow-dock" data-initial-hero="compact">
      <div className="console-dock-material" aria-hidden="true" />
      <ConsoleHomeButton onBack={onBack} />
      <ConsoleHandoff box={origin?.label}>
        <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
      </ConsoleHandoff>
      <div ref={setTarget} className="console-workflow-status" />
    </header>
    <div className="console-hub console-workflow-hub" data-closing={closing}>{children}</div>
  </StatusSlot.Provider>
}

export function WorkflowStatus({ label, children }: { label: string; children: ReactNode }) {
  const slot = useContext(StatusSlot)
  if (!slot?.target) return null
  return createPortal(<ConsoleHandoff box={slot.origin?.figure}>
    <div className="console-workflow-status-copy"><span>{label}</span><strong className="tabular-nums">{children}</strong></div>
  </ConsoleHandoff>, slot.target)
}

export function WorkflowSkeleton({ label }: { label: string }) {
  return <div className="console-workflow-skeleton" role="status">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true"><i /><i /><i /><i /><i /></div>
    <div aria-hidden="true"><i /><i /><i /></div>
  </div>
}
