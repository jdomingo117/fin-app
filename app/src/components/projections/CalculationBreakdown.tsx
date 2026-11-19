import type { ProjectionMetric } from '../../lib/projections'
import { fmt } from '../../data'
import { dateLabel } from './presentation'

export function CalculationBreakdown({
  metric,
  currentValue,
  projectedValue,
  monthlyFlow,
  months,
  investmentGrowth,
  investmentBalance,
  investmentContribution,
  annualReturn,
  historyMonths,
  historyFrom,
  historyTo,
  scenarioAdjustment,
  scenarioValue,
  scenarioLabel,
  scenarioStartLabel,
  scenarioActiveMonths,
}: {
  metric: ProjectionMetric
  currentValue: number
  projectedValue: number
  monthlyFlow: number
  months: number
  investmentGrowth: number
  investmentBalance: number
  investmentContribution: number
  annualReturn: number
  historyMonths: number
  historyFrom: string | null
  historyTo: string | null
  scenarioAdjustment: number | null
  scenarioValue: number
  scenarioLabel: string
  scenarioStartLabel: string
  scenarioActiveMonths: number
}) {
  const movement = monthlyFlow * months
  const historyRange = historyFrom && historyTo
    ? `${dateLabel(historyFrom)} – ${dateLabel(historyTo)}`
    : 'No complete history yet'

  return (
    <div id="projection-calculation" className="mt-5 border-t border-[var(--hair)] pt-5">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-5">
          <div className="micro text-muted">How we reached {fmt(projectedValue)}</div>
          <p className="mt-3 text-[15px] leading-7 text-ink2">
            Starting {metric === 'cash' ? 'cash' : 'net worth'} of <strong className="text-ink">{fmt(currentValue)}</strong>,
            {' '}plus an observed movement of <strong className={monthlyFlow >= 0 ? 'text-pos' : 'text-neg'}>{fmt(monthlyFlow)} per month</strong>,
            {' '}projected across <strong className="text-ink">{months} months</strong>
            {metric === 'netWorth' && <> with <strong className="text-ink">{fmt(investmentGrowth)}</strong> estimated investment growth</>}.
          </p>
          <div className="mt-5 overflow-x-auto rounded-lg border border-[var(--hair)] bg-[var(--glass-fill)] px-4 py-4 font-mono text-[15px] font-bold leading-6 tabular-nums text-ink">
            {metric === 'cash' ? (
              <>{fmt(currentValue)} + ({fmt(monthlyFlow)} × {months}) = <span className="text-accent-ink">{fmt(projectedValue)}</span></>
            ) : (
              <>{fmt(currentValue)} + {fmt(movement)} + {fmt(investmentGrowth)} = <span className="text-accent-ink">{fmt(projectedValue)}</span></>
            )}
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 text-[14px] leading-6">
            <BreakdownRow label={`Starting ${metric === 'cash' ? 'cash' : 'net worth'}`} value={fmt(currentValue)} />
            <BreakdownRow label="Future net movement" value={fmt(movement)} tone={movement >= 0 ? 'pos' : 'neg'} />
            {metric === 'netWorth' && <BreakdownRow label="Estimated investment growth" value={fmt(investmentGrowth)} tone={investmentGrowth >= 0 ? 'pos' : 'neg'} />}
            <div className="col-span-2 border-t border-[var(--hair)]" />
            <BreakdownRow label="Projected value" value={fmt(projectedValue)} strong />
          </div>
          {scenarioAdjustment !== null && scenarioAdjustment !== 0 && (
            <div className="mt-5 overflow-hidden rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] text-[14px]">
              <div className="border-b border-[var(--hair-soft)] px-4 py-3 font-bold text-ink">What-if comparison</div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-3 px-4 py-3.5 tabular-nums">
                <span className="text-muted">Endpoint</span><span className="text-right text-muted">Baseline</span><span className="text-right text-muted">What-if</span>
                <span className="font-semibold text-ink">Projected value</span><span className="text-right font-semibold text-ink">{fmt(projectedValue)}</span><span className="text-right font-bold text-ink">{fmt(scenarioValue)}</span>
                <span className="font-semibold text-ink">Difference</span><span className="text-right text-muted">—</span><span className={`text-right font-bold ${scenarioValue - projectedValue >= 0 ? 'text-pos' : 'text-neg'}`}>{scenarioValue - projectedValue >= 0 ? '+' : '−'}{fmt(Math.abs(scenarioValue - projectedValue))}</span>
              </div>
              <div className="border-t border-[var(--hair-soft)] px-4 py-3 text-[13px] leading-6 text-muted">
                {scenarioLabel}, starting {scenarioStartLabel} · {scenarioActiveMonths} active {scenarioActiveMonths === 1 ? 'month' : 'months'}. Comparison only; it is not included in the baseline above.
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <div className="micro text-muted">Variables & sources</div>
            <span className="text-[13px] text-muted">Nothing hidden</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--hair)]">
            <VariableRow name={`Current ${metric === 'cash' ? 'cash' : 'net worth'}`} value={fmt(currentValue)} provenance="Current" source={metric === 'cash' ? 'Liquid + savings balances' : 'All account balances'} />
            <VariableRow name="Monthly movement" value={fmt(monthlyFlow)} provenance="Observed" source={historyMonths ? `${historyMonths} complete months · ${historyRange}` : historyRange} />
            <VariableRow name="Projection horizon" value={`${months} months`} provenance="Calculated" source="Today to the forecast endpoint" />
            {metric === 'netWorth' && <VariableRow name="Investment return" value={`${annualReturn}% / year`} provenance="Assumed" source={`Applied to ${fmt(investmentBalance)} invested`} />}
            {metric === 'netWorth' && investmentContribution > 0 && <VariableRow name="Investment contributions" value={`${fmt(investmentContribution)} / month`} provenance="Observed" source="Used to grow the invested base, not counted as new wealth" />}
            {scenarioAdjustment !== null && <VariableRow name="What-if adjustment" value={`${scenarioAdjustment >= 0 ? '+' : '−'}${fmt(Math.abs(scenarioAdjustment))} / month`} provenance="Scenario" source={`${scenarioLabel}, starting ${scenarioStartLabel}`} />}
          </div>

          <details className="group mt-4 rounded-xl border border-[var(--hair)] bg-[var(--input-bg)]">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-bold text-ink outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-wash)]">
              Technical method
              <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
            </summary>
            <div className="border-t border-[var(--hair-soft)] px-4 py-4 text-[14px] leading-6 text-muted">
              {metric === 'cash' ? (
                <><code className="text-ink">Cₙ = C₀ + n(r + a)</code><p className="mt-2">C₀ is current eligible cash, r is observed monthly movement, a is a scenario adjustment, and n is the number of months. The baseline sets a to zero.</p></>
              ) : (
                <><code className="text-ink">Nₙ = Nₙ₋₁ + r + a + Iₙ₋₁i</code><p className="mt-2">N is net worth, r is observed monthly movement, a is a scenario adjustment, I is the invested balance, and i is the monthly return derived from the annual assumption. Observed investment contributions increase I but are not counted again as new net worth.</p></>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}

function BreakdownRow({ label, value, tone, strong = false }: { label: string; value: string; tone?: 'pos' | 'neg'; strong?: boolean }) {
  const color = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-ink'
  return <><span className={strong ? 'font-bold text-ink' : 'font-medium text-ink2'}>{label}</span><span className={`text-right tabular-nums ${strong ? 'text-[15px] font-bold' : 'font-bold'} ${color}`}>{value}</span></>
}

function VariableRow({ name, value, provenance, source }: { name: string; value: string; provenance: 'Current' | 'Observed' | 'Calculated' | 'Assumed' | 'Scenario'; source: string }) {
  const provenanceClass = provenance === 'Scenario' ? 'text-ink2' : provenance === 'Assumed' ? 'text-warn' : provenance === 'Observed' ? 'text-accent-ink' : 'text-muted'
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-[var(--hair-soft)] bg-[var(--glass-fill)] px-4 py-3 last:border-b-0">
      <div className="min-w-0"><div className="text-[14px] font-semibold text-ink">{name}</div><div className="mt-1 truncate text-[13px] leading-5 text-muted" title={source}>{source}</div></div>
      <div className="text-right"><div className="text-[15px] font-bold tabular-nums text-ink">{value}</div><div className={`mt-1 text-[11px] font-bold uppercase tracking-[0.09em] ${provenanceClass}`}>{provenance}</div></div>
    </div>
  )
}
