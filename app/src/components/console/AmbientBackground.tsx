import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { enabledSections, type SectionId } from './sections'
import './ambient-background.css'

const particleCount = 55
const particleLimit = 120
const driftBase = 11000
const driftStep = 2600
const twinkle = 2200
const driftX = 60
const driftY = 360
const settling = 1200
const tau = Math.PI * 2

// Stable coordinates keep the same scene mounted through section and route changes.
function scatter(index: number, salt: number) {
  const hash = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453
  return hash - Math.floor(hash)
}

type Particle = { x: number; y: number; size: number; phase: number; period: number }
function makeParticles(count: number): Particle[] {
  return Array.from({ length: Math.max(0, Math.min(particleLimit, Math.floor(count))) }, (_, index) => ({
    x: scatter(index, 1), y: scatter(index, 2), size: 1.5 + scatter(index, 3) * 2.5,
    phase: scatter(index, 4), period: driftBase + index % 7 * driftStep,
  }))
}

const circles = Array.from({ length: 9 }, (_, index) => ({
  '--light-x': `${scatter(index, 5) * 100}%`,
  '--light-y': `${15 + scatter(index, 6) * 85}%`,
  '--light-size': `${68 + scatter(index, 7) * 154}px`,
  '--light-cycle': `${18 + scatter(index, 8) * 17}s`,
  '--light-delay': `${-scatter(index, 9) * 24}s`,
}) as CSSProperties)

const ribbons = [18, 23, 29, 35].map((duration, index) => ({
  '--ribbon-cycle': `${duration}s`,
  '--ribbon-delay': `${-index * 4}s`,
  '--ribbon-lane': `${30 + index * 13}%`,
  '--ribbon-angle': `${-21 + index * 11}deg`,
}) as CSSProperties)

export function AmbientBackground({ section, paused, reduced, reduceEffects, count = particleCount }: {
  section: SectionId
  paused: boolean
  reduced: boolean
  reduceEffects: boolean
  count?: number
}) {
  const scene = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLCanvasElement>(null)
  const elapsed = useRef(0)
  const particles = useMemo(() => makeParticles(count), [count])
  const profile = import.meta.env.DEV && new URLSearchParams(location.search).has('profileAmbient')

  useEffect(() => {
    if (!paused || !scene.current) return
    const transitions = scene.current.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition)
    transitions.forEach(animation => animation.pause())
    return () => transitions.forEach(animation => { if (animation.playState === 'paused') animation.play() })
  }, [paused])

  useEffect(() => {
    if (!scene.current || paused || reduced) return
    const layer = scene.current
    const pointer = window.matchMedia('(any-pointer: fine)')
    let frame = 0
    let x = 0, y = 0
    function paint() {
      frame = 0
      if (profile) performance.mark('console.ambient.pointer.start')
      layer.style.setProperty('--ambient-pointer-x', String(x))
      layer.style.setProperty('--ambient-pointer-y', String(y))
      if (profile) performance.measure('console.ambient.pointer', 'console.ambient.pointer.start')
    }
    function queue(nextX: number, nextY: number) {
      x = nextX
      y = nextY
      if (!frame) frame = requestAnimationFrame(paint)
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
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', centre)
    }
  }, [paused, reduced, profile])

  useEffect(() => {
    const canvas = field.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !particles.length) return
    // The halo is rasterised once. The animation only blits small sprites.
    const sprite = document.createElement('canvas')
    sprite.width = sprite.height = 16
    const ink = sprite.getContext('2d')
    if (!ink) return
    const halo = ink.createRadialGradient(8, 8, 0, 8, 8, 8)
    halo.addColorStop(0, 'rgb(255 255 255 / 1)')
    halo.addColorStop(.23, 'rgb(245 249 255 / .68)')
    halo.addColorStop(.53, 'rgb(227 237 255 / .14)')
    halo.addColorStop(1, 'rgb(227 237 255 / 0)')
    ink.fillStyle = halo
    ink.fillRect(0, 0, 16, 16)

    let width = 1, height = 1, previous = 0, frame = 0
    function draw() {
      if (profile) performance.mark('console.ambient.particles.start')
      context!.clearRect(0, 0, width, height)
      for (const { x, y, size, phase, period } of particles) {
        const progress = (elapsed.current / period + phase) % 1
        const px = (x * width + progress * driftX + width) % width
        const py = (y * height - progress * driftY + height * 2) % height
        const edge = Math.min(1, progress * 8, (1 - progress) * 8)
        context!.globalAlpha = (.35 + (Math.sin(elapsed.current / twinkle * tau + phase * tau) + 1) * .24) * edge
        context!.drawImage(sprite, px, py, size * 3, size * 3)
      }
      if (profile) performance.measure('console.ambient.particles', 'console.ambient.particles.start')
    }
    function tick(time: number) {
      if (previous) elapsed.current += time - previous
      previous = time
      draw()
      frame = requestAnimationFrame(tick)
    }
    const observer = new ResizeObserver(([entry]) => {
      width = canvas.width = Math.max(1, Math.round(entry.contentRect.width))
      height = canvas.height = Math.max(1, Math.round(entry.contentRect.height))
      if (paused || reduced) draw()
    })
    observer.observe(canvas)
    if (!paused && !reduced) frame = requestAnimationFrame(tick)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [particles, paused, reduced, reduceEffects, profile])

  return <div ref={scene} className="console-scene" data-paused={paused} data-static={reduced} data-section={section}
    aria-hidden="true" style={{ '--ambient-settle': `${settling}ms` } as CSSProperties}>
    <div className="console-ambient-plane" data-depth="background">
      {enabledSections.map(item => <div key={item.id} data-section={item.id} className="console-ambient"
        data-current={item.id === section} />)}
    </div>
    <div className="console-ambient-plane console-light-plane" data-depth="background">
      <div className="console-rays" />
      <div className="console-beam" />
    </div>
    {(!reduceEffects && !reduced) && <div className="console-ambient-plane console-ribbon-plane" data-depth="ribbons">
      {ribbons.map((style, i) => <i key={i} className="console-ribbon" style={style} />)}
      {circles.map((style, i) => <i key={i} className="console-light-circle" style={style} />)}
    </div>}
    {!reduceEffects && <div className="console-ambient-plane" data-depth="particles">
      <canvas ref={field} className="console-particles" data-particle-count={particles.length} />
    </div>}
    <div className="console-vignette" />
    <div className="console-grain" />
  </div>
}
