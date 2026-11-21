import { useMemo, useState } from 'react'
import Tile from './Tile'
import Area from './charts/Area'
import Bar from './charts/Bar'
import SegmentedTabs from './SegmentedTabs'
import {addDays,iso} from '../lib/period'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const parse = (s: string) => new Date(`${s}T00:00:00`)
const fmtDay = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}`

const TABS = [
  { id: 'cumulative', label: 'Cumulative' },
  { id: 'interval', label: 'Per period' },
]

/** Expenses over time, off a shared period-adaptive binning (daily → weekly →
 *  monthly as the range grows). `Cumulative` is the running spend total (line);
 *  `Per period` is the non-cumulative spend per bin (bars). Both derive from the
 *  same account/date-scoped `outflows` as the hero cards, so they reconcile. */
export default function ExpenseTrendCard({
  buckets, bucket,
  from,
  to,
  scopeLabel,
  timeFocus,
  onTimeFocus,
  height = 420,
}: {
  buckets: {bucket:string;gross_cents:number}[]
  bucket: "day" | "week" | "month"
  from: string
  to: string
  /** the view's active category focus, if any — `outflows` arrives already
   *  filtered by it; this only retitles so the chart isn't misread as page-wide */
  scopeLabel?: string
  timeFocus: { from: string; to: string; label: string } | null
  onTimeFocus: (focus: { from: string; to: string; label: string } | null) => void
  /** The trend has a stable visual rhythm; it does not inherit the height of
   *  the adjacent category-flow diagram. */
  height?: number
}) {
  const [tab, setTab] = useState('cumulative')

  const { bins, cumulative, gran } = useMemo(() => {
    const gran = {day:'daily',week:'weekly',month:'monthly'}[bucket]
    const ranges = buckets.map((point,i)=>{
      const start = point.bucket < from ? from : point.bucket
      const end = i+1<buckets.length ? iso(addDays(parse(buckets[i+1].bucket),-1)) : to
      const date = parse(start)
      const label = bucket==='month' ? MON[date.getMonth()]+' '+date.getFullYear()
        : bucket==='week' ? fmtDay(date)+' – '+fmtDay(parse(end)) : fmtDay(date)
      return {from:start,to:end,label}
    })
    const bins = {ranges,data:buckets.map(b=>b.gross_cents),labels:ranges.map(r=>bucket==='month' ? MON[parse(r.from).getMonth()] : fmtDay(parse(r.from)))}
    let acc = 0
    const cumulative = bins.data.map((v) => (acc += v))

    return { bins, cumulative, gran }
  }, [buckets, bucket, from, to])

  const selectedIndex = useMemo(() => {
    if (!timeFocus) return null
    const idx = bins.ranges.findIndex((r) => r.from === timeFocus.from && r.to === timeFocus.to)
    return idx >= 0 ? idx : null
  }, [bins.ranges, timeFocus])

  const handleSelectBin = (idx: number) => {
    const bin = bins.ranges[idx]
    if (!bin) return
    if (timeFocus && timeFocus.from === bin.from && timeFocus.to === bin.to) {
      onTimeFocus(null)
    } else {
      onTimeFocus(bin)
    }
  }

  const empty = bins.data.every((v) => v === 0)

  return (
    <Tile className="flex flex-col">
      <header className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h3 className="font-display text-[16px] font-bold text-ink">
            {scopeLabel ? `${scopeLabel} over time` : 'Spending over time'}
          </h3>
          <span className="text-[13px] uppercase tracking-[0.06em] text-muted">
            {gran} · {tab === 'cumulative' ? 'cumulative' : 'per period'}
          </span>
        </div>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} layoutId="exp-trend-tabs" />
      </header>

      {empty ? (
        <div className="grid place-items-center py-16 text-center text-[12.5px] text-muted">
          {/* with a focus applied the period may well have spending — just none of it here */}
          {scopeLabel ? `No ${scopeLabel} spending in the selected period.` : 'No spending in the selected period.'}
        </div>
      ) : tab === 'cumulative' ? (
        <Area
          key={`cum-${from}-${to}`}
          series={[{ data: cumulative, color: 'var(--color-neg)' }]}
          labels={bins.labels}
          height={height}
          selectedIndex={selectedIndex}
          onClickDataPoint={handleSelectBin}
        />
      ) : (
        <Bar
          key={`int-${from}-${to}`}
          series={[{ data: bins.data, color: 'var(--color-neg)' }]}
          labels={bins.labels}
          height={height}
          selectedIndex={selectedIndex}
          onClickDataPoint={handleSelectBin}
        />
      )}
    </Tile>
  )
}
