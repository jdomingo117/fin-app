import { type CSSProperties } from 'react'
import { useView } from '../../router'
import { useSystemReducedMotion } from './systemMotion'
import { useConsolePreferences } from './ConsolePreferences'

const ease = {
  settle: [.16, .9, .2, 1],
  glide: [.2, .8, .2, 1],
  fade: [.4, 0, .2, 1],
} as const

export const consoleDuration = {
  micro: 250,
  focus: 420,
  track: 550,
  enter: 800,
  label: 500,
  bg: 1400,
  dwell: 380,
  reduced: 150,
  breathe: 2800,
  sweep: 3600,
  'sweep-delay': 500,
  'card-sweep': 1400,
  'card-sweep-delay': 100,
  rays: 70000,
  beam: 9000,
  hub: 600,
  stagger: 70,
  'centre-close': 350,
  'centre-actions': 450,
  'centre-icon-stagger': 35,
  start: 1100,
  'start-wordmark': 2200,
  'start-prompt': 2400,
  'start-prompt-delay': 1200,
} as const

const rise = 26
export const consoleMotionStyle = {
  ...Object.fromEntries(Object.entries(ease).map(([name, curve]) =>
    [`--ease-${name}`, `cubic-bezier(${curve.join(',')})`],
  )),
  ...Object.fromEntries(Object.entries(consoleDuration).map(([name, milliseconds]) =>
    [`--dur-${name}`, `${milliseconds}ms`],
  )),
  '--console-rise': `${rise}px`,
} as CSSProperties

export function consoleTransition(preset: keyof typeof consoleDuration, reduced = false, curve: keyof typeof ease = 'settle') {
  return { duration: consoleDuration[reduced ? 'reduced' : preset] / 1000, ease: ease[reduced ? 'fade' : curve] }
}

export const consoleProjection = consoleTransition('hub')

export function consoleRise(reduced: boolean) {
  return {
    initial: { opacity: 0, y: reduced ? 0 : rise },
    animate: { opacity: 1, y: 0 },
    transition: consoleTransition('enter', reduced),
  }
}

export function useConsoleReducedMotion() {
  const { motionOn } = useView()
  const preferences = useConsolePreferences()
  const prefersReduced = useSystemReducedMotion()
  return prefersReduced || !motionOn || preferences?.effectsTier === 'reduce'
}
