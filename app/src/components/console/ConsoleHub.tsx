import { animate, motion, useMotionValue, useMotionValueEvent, useScroll, useTransform } from 'framer-motion'
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { fmt, fmtCents } from '../../data'
import { consoleProjection, useConsoleReducedMotion } from './motion'
import type { SectionId } from './sections'
import { GlassSurface } from './GlassSurface'
import './console-hub.css'

export type ConsoleFigure = { label: string; cents?: number; signed?: boolean }
export type ConsoleArt = { label: string; values?: number[]; percent?: number }
const sharedParts = ['label', 'figure', 'art'] as const
type SharedPart = (typeof sharedParts)[number]
type ProjectionBox = Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>
export type ConsoleEntry = {
  id: SectionId
  headline?: ConsoleFigure
  art?: ConsoleArt
  origin?: Partial<Record<SharedPart, ProjectionBox>>
}

export function captureConsoleOrigin(root: HTMLElement | null): ConsoleEntry['origin'] {
  const origin: ConsoleEntry['origin'] = {}
  for (const part of sharedParts) {
    const node = root?.querySelector(`.console-home [data-console-shared="${part}"]`)
    if (node) {
      const { x, y, width, height } = node.getBoundingClientRect()
      if (width && height) origin[part] = { x, y, width, height }
    }
  }
  return origin
}

export function consoleMoney(cents: number, signed = false, whole = false) {
  const amount = (whole ? fmt : fmtCents)(cents)
  return signed && cents > 0 ? '+' + amount : amount.replace(/^-/, '−')
}

export function cumulativeValues(values: number[]) {
  let total = 0
  return values.map(value => (total += value))
}

export function ConsoleHandoff({ box, children }: { box?: ProjectionBox; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const wrapper = ref.current
    const target = wrapper?.firstElementChild
    if (!wrapper || !target || !box) return
    const targetBox = target.getBoundingClientRect()
    if (!targetBox.width || !targetBox.height) return

    // Layout IDs work within a route layer. When the new layer owns a scroll
    // container, its first frame needs the viewport coordinates of the source.
    const dx = box.x - targetBox.x
    const dy = box.y - targetBox.y
    const sx = box.width / targetBox.width
    const sy = box.height / targetBox.height
    const motion = animate(wrapper, { x: [dx, 0], y: [dy, 0], scaleX: [sx, 1], scaleY: [sy, 1] }, consoleProjection)
    return () => motion.stop()
  }, [box])

  return box ? <div ref={ref} className="console-handoff">{children}</div> : <>{children}</>
}

export function ConsoleHeadline({ id, label, figure, reduced, title, period, origin, home, redacted }: {
  id: SectionId; label: string; figure?: ConsoleFigure; reduced?: boolean; title?: string; period?: string; origin?: ConsoleEntry['origin']; home?: boolean; redacted?: boolean
}) {
  return <div className="console-headline">
    {title && <h1 className="console-hub-title">{title}</h1>}
    <ConsoleHandoff box={reduced ? undefined : origin?.label}>
      <motion.p layoutId={reduced || home ? undefined : `console-${id}-label`} transition={{ layout: consoleProjection }}
        className="console-hero-label" data-console-shared="label">{label}</motion.p>
    </ConsoleHandoff>
    {period && <p className="console-period">{period}</p>}
    <ConsoleHandoff box={reduced ? undefined : origin?.figure}>
      <motion.p
        layoutId={reduced || home ? undefined : `console-${id}-figure`}
        transition={{ layout: consoleProjection }}
        className={`console-hero-amount${redacted ? '' : ' tabular-nums'}`}
        data-console-shared="figure"
      >
        {redacted && figure ? <span className="console-hero-placeholder">Hidden</span> :
          figure?.cents === undefined ? <span className="console-hero-placeholder">{id === 'budget' && home ? 'Open to see this period' : 'Unavailable'}</span> : <>
          <span aria-hidden="true">{consoleMoney(figure.cents, figure.signed, true)}</span>
          <span className="sr-only">{consoleMoney(figure.cents, figure.signed)}</span>
        </>}
      </motion.p>
    </ConsoleHandoff>
  </div>
}

export function ConsoleFigureStrip({ figures, redacted }: { figures: ConsoleFigure[]; redacted?: boolean }) {
  return <dl className="console-figures">
    {figures.map(({ label, cents, signed }) => <div key={label}>
      <dt>{label}</dt>
      <dd className={redacted ? undefined : 'tabular-nums'} data-sign={!redacted && signed && cents ? (cents > 0 ? 'positive' : 'negative') : undefined}>
        {redacted ? 'Hidden' : cents === undefined ? 'Unavailable' : consoleMoney(cents, signed)}
      </dd>
    </div>)}
  </dl>
}

export function ConsoleHeroArt({ id, art, reduced, origin, home, redacted }: {
  id: SectionId; art?: ConsoleArt; reduced?: boolean; origin?: ProjectionBox; home?: boolean; redacted?: boolean
}) {
  const values = redacted ? [] : art?.values ?? []
  const low = Math.min(...values)
  const span = Math.max(...values) - low
  const points = values.length > 0 ? values.map((value, i) => {
    const x = 22 + i * 116 / Math.max(1, values.length - 1)
    const y = span ? 99 - (value - low) * 42 / span : 79
    return `${x},${y}`
  }).join(' ') : undefined
  const percent = redacted ? undefined : art?.percent
  if (!points && percent === undefined && !redacted) {
    if (id === 'accounts') return <p className="console-art-empty">Holdings appear here when accounts have a cash or investment balance.</p>
    if (id === 'dashboard') return <div aria-hidden="true" className="console-orb" />
    return null
  }
  return (
    <ConsoleHandoff box={reduced ? undefined : origin}>
    <motion.figure layoutId={reduced || home ? undefined : `console-${id}-art`} transition={{ layout: consoleProjection }}
      className="console-orb" data-console-shared="art">
      <div className="console-orb-core" aria-hidden="true" />
      <svg aria-hidden="true" viewBox="0 0 160 160" fill="none">
        <circle cx="80" cy="80" r="75" stroke="currentColor" strokeOpacity=".45" strokeDasharray="1 4" />
        <circle cx="80" cy="80" r="68" stroke="currentColor" strokeOpacity=".25" />
        <circle cx="80" cy="80" r="63" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" />
        {percent !== undefined ? <circle className="console-orb-progress" cx="80" cy="80" r="63" pathLength="100"
          stroke="currentColor" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 80 80)"
          strokeDasharray={`${Math.min(100, Math.max(0, percent))} 100`} /> : points && <>
          <path className="console-orb-area" d={`M22,110 L${points.replaceAll(' ', ' L')} L138,110 Z`} />
          <polyline className="console-orb-line" points={points} />
        </>}
      </svg>
      {redacted ? <figcaption className="sr-only">Trend hidden</figcaption> :
        percent !== undefined ? <>
          <div className="console-orb-stat tabular-nums" aria-hidden="true"><strong>{percent}%</strong></div>
          <figcaption className="sr-only">{art?.label}: {percent}%</figcaption>
        </> :
        <figcaption className="sr-only">{art?.label}. First value {fmtCents(values[0])}. Last value {fmtCents(values[values.length - 1])}.</figcaption>}
    </motion.figure>
    </ConsoleHandoff>
  )
}

export function ConsoleModule({ title, tools, children, kind, order = 0 }: {
  title: string; tools?: ReactNode; children: ReactNode; kind?: 'flat' | 'chart'; order?: number
}) {
  return <GlassSurface as="section" material={kind === 'flat' ? 'opaque' : 'hub'} className="console-module" data-focus-ring data-console-row-item tabIndex={0}
    aria-label={title} style={{ '--console-module-order': order } as React.CSSProperties}>
    <header><h2 data-module-title className="console-module-title">{title}</h2>{tools}</header>
    {children}
  </GlassSurface>
}

export function ConsoleChartValues({ labels, series }: { labels: string[]; series: { label: string; data: number[] }[] }) {
  return <details className="console-chart-values">
    <summary>View chart values</summary>
    <div className="console-values-scroll"><table>
      <thead><tr><th scope="col">Date</th>{series.map(item => <th scope="col" key={item.label}>{item.label}</th>)}</tr></thead>
      <tbody>{labels.map((label, i) => <tr key={i}><th scope="row">{label}</th>{series.map(item =>
        <td key={item.label} className="tabular-nums">{fmtCents(item.data[i])}</td>)}</tr>)}</tbody>
    </table></div>
  </details>
}

const phoneFilters = '(max-width: 600px)'
function subscribeToPhoneFilters(notify: () => void) {
  const query = window.matchMedia(phoneFilters)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}

export function ConsoleHomeButton({ onBack }: { onBack: () => void }) {
  return <button type="button" className="console-hub-back" onClick={onBack} aria-label="Back to Home">
    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 12H5m7-7-7 7 7 7" /></svg><span>Home</span>
  </button>
}

export default function ConsoleHub({ id, title, period, figure, strip, art, filters, tabs, entry, onBack, children, redacted }: {
  id: 'income' | 'dashboard' | 'accounts' | 'expenses'
  title: string
  period: string
  figure: ConsoleFigure
  strip: ConsoleFigure[]
  art?: ConsoleArt
  filters?: ReactNode
  tabs?: ReactNode
  entry?: ConsoleEntry
  onBack: () => void
  children: ReactNode
  redacted?: boolean
}) {
  const reduce = useConsoleReducedMotion()
  const filtersBelowHero = useSyncExternalStore(subscribeToPhoneFilters,
    () => window.matchMedia(phoneFilters).matches, () => false)
  const scroll = useRef<HTMLDivElement>(null)
  const hero = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const height = useMotionValue(280)
  const { scrollY } = useScroll({ container: scroll })
  const progress = useTransform(() => {
    const end = Math.max(90, height.get() - 26)
    const value = Math.max(0, Math.min(1, (scrollY.get() - 20) / end))
    return reduce ? +(value >= .58) : value
  })
  const heroOpacity = useTransform(progress, [0, .3, .75, 1], [1, 1, 0, 0])
  const heroShift = useTransform(progress, [0, 1], [0, -22])
  const headerOpacity = useTransform(progress, [0, .30, .75, 1], [0, 0, 1, 1])
  const headerShift = useTransform(progress, [0, 1], [12, 0])
  const [compact, setCompact] = useState(false)
  useMotionValueEvent(progress, 'change', value => {
    const next = value >= .6
    setCompact(current => current === next ? current : next)
  })

  useLayoutEffect(() => {
    const element = hero.current
    if (!element) return
    const measure = () => height.set(element.offsetHeight)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    heading.current?.focus({ preventScroll: true })
    return () => observer.disconnect()
  }, [height])

  return (
    <motion.div ref={scroll} layoutScroll className="console-designed-scroll" data-section={id} data-hero-state={compact ? 'compact' : 'expanded'}>
      <header className="console-hub-dock">
        <motion.div className="console-dock-material" style={{ opacity: compact ? 1 : headerOpacity }} aria-hidden="true" />
        <div className="console-dock-top">
          <ConsoleHomeButton onBack={onBack} />
          <h2 ref={heading} tabIndex={-1} className="sr-only">{title} hub</h2>
          <motion.div className="console-compact-title" style={{ opacity: headerOpacity, y: reduce ? 0 : headerShift }} aria-hidden={!compact}>
            <span>{title}</span>
            <strong className={redacted ? undefined : 'tabular-nums'}>{redacted ? 'Hidden' : figure.cents === undefined ? 'Unavailable' : consoleMoney(figure.cents, figure.signed)}</strong>
          </motion.div>
          {tabs && <div className="console-hub-tabs">{tabs}</div>}
        </div>
        {filters && !filtersBelowHero && <div className="console-hub-filters">{filters}</div>}
      </header>
      <motion.section ref={hero} className="console-expanded-hero" style={{ opacity: heroOpacity, y: reduce ? 0 : heroShift }} aria-hidden={compact}>
        <div className="console-expanded-copy">
          <ConsoleHeadline id={id} label={figure.label} figure={figure} reduced={reduce} title={title} period={period} origin={entry?.origin} redacted={redacted} />
          {strip.length > 0 && <ConsoleFigureStrip figures={strip} redacted={redacted} />}
        </div>
        <ConsoleHeroArt id={id} art={art} reduced={reduce} origin={entry?.origin?.art} redacted={redacted} />
      </motion.section>
      {filters && filtersBelowHero && <div className="console-hub-filters console-hub-filters-mobile">{filters}</div>}
      <div className="console-hub-body">{children}</div>
    </motion.div>
  )
}
