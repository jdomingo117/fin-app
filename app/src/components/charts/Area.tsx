import { consoleAxis, formatConsoleTick } from '../../lib/consoleAxis'
import anime from 'animejs'
import { fmtCents } from '../../data'
import { useEffect, useId, useRef, useState } from 'react'
import { useChartReveal, CHART_EASE } from '../../hooks/useChartReveal'
import { useResponsiveChartSize } from '../../hooks/useResponsiveChartSize'
import { chartYTickCount, visibleTickIndices } from '../../lib/chartDensity'
import { chartIndexFromPointer } from '../../lib/chartInteraction'
import SharedChartTooltip from './SharedChartTooltip'

export interface Series {
  data: number[]
  color: string // CSS color
  fill?: boolean
  /** Shown in grouped tooltips when this chart has more than one series. */
  label?: string
}

// Series data is in CENTS, like every other amount in the app (see the
// comment on fmt()/fmtCents() in data.ts). Divide by 100 before the k-scaling
// below, which otherwise operates on dollars.
const formatChartVal = (v: number) => {
  const absV = Math.abs(v) / 100
  return absV >= 1000
    ? (v < 0 ? '-' : '') + '$' + (absV / 1000).toFixed(1) + 'k'
    : (v < 0 ? '-' : '') + '$' + Math.round(absV)
}

const formatChartTick = (v: number) => {
  const absV = Math.abs(v) / 100
  return absV >= 1000
    ? (v < 0 ? '-' : '') + '$' + Math.round(absV / 1000) + 'k'
    : (v < 0 ? '-' : '') + '$' + Math.round(absV)
}

export default function Area({
  series,
  labels = [],
  height = 240,
  selectedIndex = null,
  onClickDataPoint,
  ariaLabel = 'Financial trend line chart',
  consoleStyle = false,
}: {
  series: Series[]
  labels?: string[]
  height?: number
  selectedIndex?: number | null
  onClickDataPoint?: (idx: number) => void
  ariaLabel?: string
  consoleStyle?: boolean
}) {
  const { ref: containerRef, width: W, height: H, ready } = useResponsiveChartSize({
    // Preserve each existing call site's intended desktop proportion while
    // allowing the shared foundation to reduce height on compact cards.
    aspectRatio: 640 / height,
    maxHeight: height,
  })
  const padL = 52
  const padR = 16
  const padT = consoleStyle ? 27 : 16
  const padB = 30
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const yTickCount = chartYTickCount(innerH)
  const xTickIndices = visibleTickIndices(labels.length, innerW)
  const all = series.flatMap((s) => s.data)
  const maxValue = (all.length ? Math.max(...all) : 0) * 1.15
  const minValue = Math.min(0, ...all) * 0.95
  const axis = consoleStyle ? consoleAxis(Math.min(minValue, ...all), maxValue, yTickCount) : undefined
  const { min, max } = axis ?? { min: minValue, max: maxValue }
  const span = max - min || 1
  const n = series[0].data.length
  // a single point has no horizontal span — centre it instead of dividing by 0
  const xOf = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW)
  const yOf = (v: number) => padT + innerH - ((v - min) / span) * innerH
  const uid = useId().replace(/:/g, '')

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // geometry per series
  const geo = series.map((s) => {
    const pts = s.data.map((v, i) => [xOf(i), yOf(v)] as const)
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
    const last = pts[pts.length - 1]
    const fillPath = `${line} L${xOf(n - 1).toFixed(1)} ${padT + innerH} L${padL} ${padT + innerH} Z`
    return { ...s, line, fillPath, last }
  })

  const ref = useChartReveal<SVGSVGElement>(
    (scope) => {
      const lines = scope.querySelectorAll<SVGPathElement>('.area-line')
      const fills = scope.querySelectorAll<SVGPathElement>('.area-fill')
      const travels = scope.querySelectorAll<SVGGElement>('.area-dot-travel')
      const dots = scope.querySelectorAll<SVGCircleElement>('.area-dot')
      const created: anime.AnimeInstance[] = []

      lines.forEach((el, i) => {
        created.push(anime({ targets: el, strokeDashoffset: [1, 0], duration: 1300, delay: i * 120, easing: CHART_EASE }))
        const travel = travels[i]
        const dot = dots[i]
        if (travel && dot) {
          const path = anime.path(el)
          created.push(
            anime({ targets: travel, translateX: path('x'), translateY: path('y'), duration: 1300, delay: i * 120, easing: CHART_EASE }),
          )
          created.push(anime({ targets: dot, opacity: [0, 1], scale: [0, 1], duration: 320, delay: i * 120, easing: 'easeOutBack' }))
          created.push(anime({ targets: dot, scale: [1, 1.5, 1], duration: 460, delay: i * 120 + 1300, easing: 'easeOutElastic(1, .6)' }))
        }
      })
      created.push(anime({ targets: fills, opacity: [0, 1], duration: 800, delay: 500, easing: 'linear' }))
      return created
    },
    (scope) => {
      scope.querySelectorAll<SVGPathElement>('.area-line').forEach((el) => (el.style.strokeDashoffset = '0'))
      scope.querySelectorAll<SVGPathElement>('.area-fill').forEach((el) => (el.style.opacity = '1'))
      scope.querySelectorAll<SVGGElement>('.area-dot-travel').forEach((g, i) => {
        anime.set(g, { translateX: geo[i].last[0], translateY: geo[i].last[1] })
      })
      scope.querySelectorAll<SVGCircleElement>('.area-dot').forEach((el) => (el.style.opacity = '1'))
    },
  )

  // Anime leaves the travelling end-dot as a transform after its entrance
  // animation. Reposition it when a completed chart receives a new measured
  // width, otherwise the line resizes while its endpoint marker stays behind.
  const renderedWidth = useRef<number | null>(null)
  useEffect(() => {
    if (renderedWidth.current !== null && renderedWidth.current !== W) {
      ref.current?.querySelectorAll<SVGGElement>('.area-dot-travel').forEach((g, i) => {
        anime.set(g, { translateX: geo[i].last[0], translateY: geo[i].last[1] })
      })
    }
    renderedWidth.current = W
  }, [W, geo, ref])

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHoveredIdx(chartIndexFromPointer({
      clientX: e.clientX,
      rectLeft: rect.left,
      renderedWidth: rect.width,
      viewBoxWidth: W,
      plotLeft: padL,
      plotWidth: innerW,
      pointCount: n,
    }))
  }

  const handlePointerLeave = () => {
    setHoveredIdx(null)
  }

  return (
    <div ref={containerRef} style={{ minHeight: ready ? H : Math.min(height, 180) }}>
      {ready && <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: 'block', touchAction: 'none', cursor: onClickDataPoint ? 'pointer' : 'default' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={() => {
          if (hoveredIdx !== null) onClickDataPoint?.(hoveredIdx)
        }}
        role="img"
        aria-label={ariaLabel}
      >
      {/* gridlines + $ ticks */}
      {(axis?.ticks ?? Array.from({ length: yTickCount }, (_, g) => max - (g / (yTickCount - 1)) * span)).map((val, g) => {
        const y = yOf(val)
        return (
          <g key={g}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--hair-soft)" strokeWidth={1} />
            <text
              x={padL - 8}
              y={y + 4}
              fill="var(--color-muted)"
              fontSize={12}
              textAnchor="end"
              letterSpacing="0.04em"
              className="tabular-nums" data-console-axis-tick={axis ? val : undefined}
            >
              {axis ? formatConsoleTick(val) : formatChartTick(val)}
            </text>
          </g>
        )
      })}
      {/* X-axis labels are constrained by usable chart width, not data count. */}
      {xTickIndices.map((i) => (
        <text key={i} x={xOf(i)} y={H - 8} fill="var(--color-muted)" fontSize={12} textAnchor={consoleStyle && i === 0 ? "start" : consoleStyle && i === labels.length - 1 ? "end" : "middle"}>
          {labels[i]}
        </text>
      ))}
      {/* series */}
      {geo.map((s, si) => {
        const gid = `area-${uid}-${si}`
        return (
          <g key={si}>
            {s.fill !== false && (
              <>
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={consoleStyle ? 'var(--console-chart-tint)' : s.color} stopOpacity={consoleStyle ? 0.20 : 0.16} />
                    <stop offset="100%" stopColor={consoleStyle ? 'var(--console-chart-tint)' : s.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <path className={consoleStyle ? undefined : 'area-fill'} d={s.fillPath} fill={`url(#${gid})`} style={{ opacity: 1 }} />
              </>
            )}
            <path
              className={consoleStyle ? 'console-area-line' : 'area-line'}
              d={s.line}
              pathLength={consoleStyle ? undefined : 1}
              fill="none"
              stroke={s.color}
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeDasharray={consoleStyle && si > 0 ? '5 5' : undefined}
              style={consoleStyle ? undefined : { strokeDasharray: 1, strokeDashoffset: 0 }}
            />
            {consoleStyle ? <>
              <circle cx={s.last[0]} cy={s.last[1]} r={3} fill={s.color} />
              {si === 0 && <text className="console-chart-end tabular-nums" x={s.last[0]} y={s.last[1] - 10}
                textAnchor="end" fill={s.color}>{fmtCents(s.data[s.data.length - 1])}</text>}
            </> : <g className="area-dot-travel">
              <circle
                className="area-dot"
                cx={0}
                cy={0}
                r={3.2}
                fill={s.color}
                style={{ opacity: 1, transformBox: 'fill-box', transformOrigin: 'center' }}
              />
            </g>}
          </g>
        )
      })}

      {/* Selected index guide line & point highlights */}
      {selectedIndex !== null && selectedIndex >= 0 && selectedIndex < n && (
        <g pointerEvents="none">
          <line
            x1={xOf(selectedIndex)}
            y1={padT}
            x2={xOf(selectedIndex)}
            y2={padT + innerH}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            opacity={0.8}
          />
          {series.map((s, si) => {
            const val = s.data[selectedIndex]
            const x = xOf(selectedIndex)
            const y = yOf(val)
            return (
              <g key={`sel-${si}`}>
                <circle cx={x} cy={y} r={6} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 0 3px var(--color-accent))' }} />
                <circle cx={x} cy={y} r={12} fill="var(--color-accent)" opacity={0.2} />
              </g>
            )
          })}
        </g>
      )}

      {/* Tooltip elements */}
      {hoveredIdx !== null && (
        <g pointerEvents="none">
          {/* Vertical guide line */}
          <line
            x1={xOf(hoveredIdx)}
            y1={padT}
            x2={xOf(hoveredIdx)}
            y2={padT + innerH}
            stroke="var(--color-accent)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />

          {series.map((s, si) => {
            const val = s.data[hoveredIdx]
            const x = xOf(hoveredIdx)
            const y = yOf(val)

            return (
              <g key={si}>
                {/* Active point hover ring */}
                <circle cx={x} cy={y} r={6} fill="var(--color-surface)" stroke={s.color} strokeWidth={2.5} />
                <circle cx={x} cy={y} r={12} fill={s.color} opacity={0.15} />
              </g>
            )
          })}
          <SharedChartTooltip
            label={labels[hoveredIdx] ?? ''}
            items={series.map((s, index) => ({
              color: s.color,
              label: s.label ?? (series.length === 1 ? 'Value' : `Series ${index + 1}`),
              value: consoleStyle ? fmtCents(s.data[hoveredIdx]) : formatChartVal(s.data[hoveredIdx]),
            }))}
            anchorX={xOf(hoveredIdx)}
            pointYs={series.map((s) => yOf(s.data[hoveredIdx]))}
            bounds={{ left: padL, right: W - padR, top: padT, bottom: padT + innerH }}
          />
        </g>
      )}
      </svg>}
    </div>
  )
}
