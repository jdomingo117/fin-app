import type { EffectsTier } from './effectsTier'
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { enabledSections, type SectionId } from './sections'
import './ambient-background.css'

const particleCount = 55
const balancedParticleLimit = 20
const particleLimit = 120
const driftBase = 11000
const driftStep = 2600
const twinkle = 2200
const settling = 1200
const pointerQuiet = 160
const figureSelector = [
  '.console-hero-amount', '[data-sign]', '.console-activity-card strong.tabular-nums',
  '.console-compact-title strong', '.console-orb-stat strong',
  '.console-hub-body :is([data-console-surface="hub"], .glass) .tabular-nums',
].join(', ')
const movingFigureSelector = '.console-handoff, .console-preview, .console-expanded-hero'

function watchParticleMask(scene: HTMLElement, layer: HTMLElement) {
  const main = scene.parentElement?.querySelector('.console-main')
  if (!main) return

  const padding = 14
  const moduleRise = Number.parseFloat(getComputedStyle(scene).getPropertyValue('--console-rise')) || 0
  let frame = 0
  let rescan = true
  let figures: Element[] = []
  let previous = ''

  const schedule = () => {
    if (!frame && !document.hidden) frame = requestAnimationFrame(update)
  }
  const resize = new ResizeObserver(schedule)
  const moving = new MutationObserver(schedule)

  function update() {
    frame = 0
    if (rescan) {
      rescan = false
      figures = [...main!.querySelectorAll(figureSelector)]
      resize.disconnect()
      resize.observe(scene)
      for (const figure of figures) resize.observe(figure)
      moving.disconnect()
      for (const target of main!.querySelectorAll(movingFigureSelector)) {
        moving.observe(target, { attributes: true, attributeFilter: ['style'] })
      }
    }

    const area = scene.getBoundingClientRect()
    const boxes = figures.flatMap(figure => {
      const { left, right, top, bottom, width, height } = figure.getBoundingClientRect()
      if (!width || !height || right <= area.left || left >= area.right || bottom <= area.top || top >= area.bottom) return []
      const blockPadding = padding + (figure.closest('.console-hub-body') ? moduleRise : 0)
      return [[Math.floor(left - area.left) - padding, Math.floor(top - area.top) - blockPadding,
        Math.ceil(width) + 2 * padding, Math.ceil(height) + 2 * blockPadding]]
    })
    const geometry = boxes.join('|')
    if (geometry === previous) return
    previous = geometry
    const solid = 'linear-gradient(white, white)'
    // Add all exclusions together before subtracting them from the full layer.
    // Overlapping figure bounds therefore stay cut out.
    const cutouts = boxes.map(([x, y, width, height]) => `${solid} ${x}px ${y}px / ${width}px ${height}px no-repeat add`)
    layer.style.mask = cutouts.length ? [`${solid} subtract`, ...cutouts].join(', ') : ''
  }

  const content = new MutationObserver(() => { rescan = true; schedule() })
  content.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sign'] })
  main.addEventListener('animationend', schedule)
  window.addEventListener('scroll', schedule, { capture: true, passive: true })
  document.addEventListener('visibilitychange', schedule)
  update()
  return () => {
    cancelAnimationFrame(frame)
    content.disconnect()
    moving.disconnect()
    resize.disconnect()
    main.removeEventListener('animationend', schedule)
    window.removeEventListener('scroll', schedule, true)
    document.removeEventListener('visibilitychange', schedule)
  }
}

// Stable coordinates keep the same scene mounted through section and route changes.
function scatter(index: number, salt: number) {
  const hash = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453
  return hash - Math.floor(hash)
}

const particleBandCount = 7
const driftDistance = 360

// Paint the halos once per band. Drift and twinkle share that small surface.
function makeParticleBands(count: number) {
  const bounded = Math.max(0, Math.min(particleLimit, Math.floor(count)))
  const bands = Array.from({ length: Math.min(particleBandCount, bounded) }, (_, band) => {
    const phase = scatter(band, 4)
    const period = driftBase + band * driftStep
    const style = {
      '--particle-band': band,
      '--particle-offset': `${phase * driftDistance}px`,
      '--particle-period': `${period}ms`,
      '--particle-drift-delay': `${-phase * period}ms`,
      // End each drift at the dim end of a complete twinkle cycle.
      '--particle-twinkle': `${period / Math.round(period / twinkle)}ms`,
    } as CSSProperties
    const sprites = Array.from({ length: Math.ceil((bounded - band) / particleBandCount) }, (_, index) => {
      const seed = index * particleBandCount + band
      return {
        '--particle-x': `${scatter(seed, 1) * 100}%`,
        '--particle-y': `${scatter(seed, 2) * 100}%`,
        '--particle-size': `${(1.5 + scatter(seed, 3) * 2.5) * 3}px`,
      } as CSSProperties
    })
    return { style, sprites }
  })
  return { count: bounded, bands }
}

const circleCount = 9
const circlePaint = Array.from({ length: circleCount }, (_, index) => {
  const x = scatter(index, 5) * 100
  const y = 15 + scatter(index, 6) * 85
  const radius = 34 + scatter(index, 7) * 77
  return `radial-gradient(circle ${radius}px at ${x}% ${y}%, var(--ambient-circle-ink), transparent 100%)`
}).join(', ')

const depths = { background: [-10, -8], ribbons: [-26, -18], particles: [-48, -30] } as const

const ribbons = [18, 23, 29, 35].map((duration, index) => ({
  '--ribbon-cycle': `${duration}s`,
  '--ribbon-delay': `${-index * 4}s`,
  '--ribbon-lane': `${30 + index * 13}%`,
  '--ribbon-angle': `${-21 + index * 11}deg`,
}) as CSSProperties)

export function AmbientBackground({ section, paused, reduced, tier, count = particleCount }: {
  section: SectionId
  paused: boolean
  reduced: boolean
  tier: EffectsTier
  count?: number
}) {
  const scene = useRef<HTMLDivElement>(null)
  const particleMask = useRef<HTMLDivElement>(null)
  const reduceEffects = tier === 'reduce'
  const budget = tier === 'balanced' ? Math.min(balancedParticleLimit, count) : count
  const particleBands = useMemo(() => makeParticleBands(budget), [budget])
  const profile = import.meta.env.DEV && new URLSearchParams(location.search).has('profileAmbient')

  useLayoutEffect(() => {
    if (!reduceEffects && scene.current && particleMask.current) return watchParticleMask(scene.current, particleMask.current)
  }, [reduceEffects])

  useEffect(() => {
    if (!paused || !scene.current) return
    const transitions = scene.current.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition)
    transitions.forEach(animation => animation.pause())
    return () => transitions.forEach(animation => { if (animation.playState === 'paused') animation.play() })
  }, [paused])

  useEffect(() => {
    if (!scene.current || paused || reduced) return
    const root = scene.current
    const planes = Array.from(root.querySelectorAll<HTMLElement>('[data-depth]'))
      .map(node => ({ node, distance: depths[node.dataset.depth as keyof typeof depths] }))
    const pointer = window.matchMedia('(any-pointer: fine)')
    let frame = 0
    let settleTimer = 0
    let targetX = 0, targetY = 0
    let currentX = 0, currentY = 0
    let sampledAt = 0
    function paint(x: number, y: number) {
      if (profile) performance.mark('console.ambient.pointer.start')
      for (const { node, distance: [dx, dy] } of planes) {
        node.style.transform = `translate3d(${x * dx}px, ${y * dy}px, 0)`
      }
      if (profile) performance.measure('console.ambient.pointer', 'console.ambient.pointer.start')
    }
    function track(time: number) {
      frame = 0
      if (!sampledAt) {
        // A new gesture can interrupt the tail of the previous glide.
        const { node, distance: [dx, dy] } = planes[0]
        const position = new DOMMatrixReadOnly(getComputedStyle(node).transform)
        currentX = position.m41 / dx
        currentY = position.m42 / dy
        root.dataset.tracking = 'true'
      }
      const elapsed = sampledAt ? time - sampledAt : 1000 / 60
      const blend = 1 - Math.exp(-elapsed / pointerQuiet)
      currentX += (targetX - currentX) * blend
      currentY += (targetY - currentY) * blend
      sampledAt = time
      paint(currentX, currentY)
    }
    function queue(nextX: number, nextY: number) {
      if (nextX === targetX && nextY === targetY && sampledAt) return
      targetX = nextX
      targetY = nextY
      if (!frame) frame = requestAnimationFrame(track)
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        // Only the tail needs a continuous transition. During tracking the
        // scene follows input samples with one coalesced write per frame.
        sampledAt = 0
        delete root.dataset.tracking
        paint(targetX, targetY)
      }, pointerQuiet)
    }
    function move(event: PointerEvent) {
      if (event.pointerType === 'touch' || !pointer.matches) {
        queue(0, 0)
        return
      }
      const normalise = (position: number, size: number) => Math.max(-1, Math.min(1, position / size * 2 - 1))
      queue(normalise(event.clientX, innerWidth), normalise(event.clientY, innerHeight))
    }
    const centre = () => queue(0, 0)
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', centre)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer)
      delete root.dataset.tracking
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', centre)
    }
  }, [paused, reduced, profile, tier])

  return <div ref={scene} className="console-scene" data-paused={paused} data-static={reduced} data-tier={tier} data-section={section}
    aria-hidden="true" style={{ '--ambient-settle': `${settling}ms` } as CSSProperties}>
    <div className="console-ambient-plane" data-depth="background">
      {enabledSections.map(item => <div key={item.id} data-section={item.id} className="console-ambient"
        data-current={item.id === section} />)}
      <div className="console-light-plane">
        <div className="console-rays" />
        <div className="console-beam" />
      </div>
    </div>
    {(!reduceEffects && !reduced) && <div className="console-ambient-plane console-ribbon-plane" data-depth={tier === 'full' ? 'ribbons' : undefined}>
      {ribbons.map((style, i) => <i key={i} className="console-ribbon" style={style} />)}
      <div className="console-light-circles" data-light-count={circleCount} style={{ backgroundImage: circlePaint }} />
    </div>}
    {!reduceEffects && <div ref={particleMask} className="console-particle-mask">
        <div className="console-ambient-plane" data-depth="particles">
          <div className="console-particles" data-particle-count={particleBands.count}>
            {particleBands.bands.map(({ style, sprites }, band) => (
              <div key={band} className="console-particle-band" style={style}>
                {sprites.map((sprite, index) => <i key={index} className="console-particle" style={sprite} />)}
              </div>
            ))}
          </div>
        </div>
    </div>}
    <div className="console-vignette" />
    <div className="console-grain" />
  </div>
}
