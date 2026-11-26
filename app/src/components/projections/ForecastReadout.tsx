import type { ReactNode } from 'react'
import { fmt } from '../../data'
import { dateLabel, type QuestionMode } from './presentation'

export function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return <span className="inline-flex items-center gap-2"><span className="w-5 border-t-[3px]" style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />{label}</span>
}

export function ForecastReadout({
  baselineMovement,
  historyMonths,
  projectedGap,
  target,
  targetDate,
  mode,
  scenarioVisible,
  scenarioDelta,
  targetTimingDelta,
}: {
  baselineMovement: number
  historyMonths: number
  projectedGap: number
  target: number
  targetDate: string
  mode: QuestionMode
  scenarioVisible: boolean
  scenarioDelta: number
  targetTimingDelta: number | null
}) {
  const onTrack = projectedGap >= 0
  const timing = targetTimingDelta === null
    ? null
    : targetTimingDelta === 0
      ? 'The scenario leaves the forecast goal month unchanged.'
      : `The scenario reaches the goal ${Math.abs(targetTimingDelta)} ${Math.abs(targetTimingDelta) === 1 ? 'month' : 'months'} ${targetTimingDelta < 0 ? 'sooner' : 'later'}.`

  return (
    <section aria-label="Forecast readout" className="mt-5 shrink-0 grid border-t border-[var(--hair-soft)] pt-4 sm:grid-cols-3">
      <ForecastInsight
        label="Baseline movement"
        value={`${fmt(baselineMovement)} / month`}
        detail={`Observed across ${historyMonths || 'no'} complete ${historyMonths === 1 ? 'month' : 'months'} of settled history.`}
        tone={baselineMovement >= 0 ? 'text-pos' : 'text-neg'}
      />
      <ForecastInsight
        label={onTrack ? 'Goal buffer' : 'Goal shortfall'}
        value={`${fmt(Math.abs(projectedGap))} ${onTrack ? 'ahead' : 'short'}`}
        detail={mode === 'byDate' ? `Against the ${fmt(target)} goal by ${dateLabel(targetDate)}.` : 'At the current forecast endpoint.'}
        tone={onTrack ? 'text-pos' : 'text-neg'}
      />
      <ForecastInsight
        label="Scenario effect"
        value={!scenarioVisible ? 'Scenario off' : mode === 'byDate' ? `${scenarioDelta >= 0 ? '+' : '−'}${fmt(Math.abs(scenarioDelta))}` : timing ? timing.split('.').at(0) ?? 'Compared with baseline' : 'Compared with baseline'}
        detail={!scenarioVisible ? 'Turn on a what-if change to compare it with the baseline.' : mode === 'byDate' ? 'Difference at the forecast endpoint versus the baseline.' : timing ?? 'Compare the scenario with the baseline trajectory.'}
        tone={!scenarioVisible ? 'text-muted' : scenarioDelta >= 0 || (targetTimingDelta !== null && targetTimingDelta < 0) ? 'text-pos' : 'text-neg'}
        sign={scenarioVisible && mode === 'byDate' && scenarioDelta ? (scenarioDelta > 0 ? 'positive' : 'negative') : undefined}
      />
    </section>
  )
}

function ForecastInsight({ label, value, detail, tone, sign }: { label: string; value: string; detail: string; tone: string; sign?: 'positive' | 'negative' }) {
  return (
    <div className="border-[var(--hair-soft)] px-0 py-2.5 first:pt-0 sm:border-r sm:px-4 sm:py-0 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0">
      <div className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div data-sign={sign} className={`mt-1.5 text-[16px] font-bold tabular-nums ${tone}`}>{value}</div>
      <p className="mt-2 text-[14px] leading-6 text-muted">{detail}</p>
    </div>
  )
}

export function Assumption({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><div className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted">{label}</div><div className="mt-2 text-[16px] font-bold tabular-nums text-ink">{value}</div><div className="mt-2 text-[14px] leading-6 text-muted">{detail}</div></div>
}

export function PlanningWarning({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-[14px] leading-6 text-ink2">{children}</p>
}
