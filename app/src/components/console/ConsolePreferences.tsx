import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Switch } from '../Controls'
import { SoundEngine, type ConsoleCue } from './SoundEngine'
import { effectsTiers, useDefaultEffectsTier, type EffectsTier } from './effectsTier'
import { useSystemReducedMotion } from './systemMotion'

type Preferences = {
  sound: boolean
  muted: boolean
  music: boolean
  volume: number
  reducedSound: boolean
  effectsTier: EffectsTier | null
  centreShortcut: boolean
  startScreen: boolean
}

const defaults: Preferences = {
  sound: false, muted: false, music: false, volume: 55,
  reducedSound: false, effectsTier: null, centreShortcut: true, startScreen: false,
}
const key = 'halcyon-console-preferences'

function readPreferences(): Preferences {
  try {
    const value: (Partial<Preferences> & { reduceEffects?: boolean }) | null = JSON.parse(localStorage.getItem(key) ?? 'null')
    return {
      sound: value?.sound === true,
      muted: value?.muted === true,
      music: value?.music === true,
      volume: typeof value?.volume === 'number' && Number.isFinite(value.volume)
        ? Math.min(100, Math.max(0, value.volume)) : defaults.volume,
      reducedSound: value?.reducedSound === true,
      effectsTier: value?.effectsTier && effectsTiers.includes(value.effectsTier) ? value.effectsTier
        : value?.reduceEffects === true ? 'reduce' : null,
      centreShortcut: value?.centreShortcut !== false,
      startScreen: value?.startScreen === true,
    }
  } catch {
    return defaults
  }
}

function useConsoleControls(visible: boolean) {
  const [preferences, setPreferences] = useState(readPreferences)
  const latest = useRef(preferences)
  const [engine] = useState(() => new SoundEngine())
  const defaultTier = useDefaultEffectsTier()
  const effectsTier = preferences.effectsTier ?? defaultTier
  const systemReduced = useSystemReducedMotion()
  const soundAllowed = preferences.sound && (!systemReduced || preferences.reducedSound)

  const apply = useCallback((next: Preferences) => {
    engine.setConfig({
      enabled: next.sound && (!systemReduced || next.reducedSound), muted: next.muted,
      music: next.music, volume: next.volume / 100, visible,
    })
  }, [engine, systemReduced, visible])

  useLayoutEffect(() => apply(latest.current), [apply])
  useLayoutEffect(() => () => engine.dispose(), [engine])

  const unlock = useCallback(() => { void engine.unlockFromGesture() }, [engine])
  const play = useCallback((cue: ConsoleCue, position?: number) => engine.play(cue, position), [engine])
  const playFromGesture = useCallback((cue: ConsoleCue) => {
    if (!navigator.userActivation.isActive) return engine.play(cue)
    void engine.unlockFromGesture().then(ready => { if (ready) engine.play(cue) })
  }, [engine])

  function update(changes: Partial<Preferences>) {
    const next = { ...latest.current, ...changes }
    latest.current = next
    setPreferences(next)
    apply(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* The session still applies the choice. */ }
  }

  function toggle(key: 'music' | 'startScreen' | 'centreShortcut') {
    const next = !latest.current[key]
    update({ [key]: next })
    playFromGesture(next ? 'toggleOn' : 'toggleOff')
  }

  function setSound(sound: boolean) {
    if (!sound) {
      play('toggleOff')
      // Muting takes effect immediately. The visible switch is authoritative.
      update({ sound: false, reducedSound: false })
      return
    }
    update({ sound: true, muted: false, reducedSound: systemReduced })
    playFromGesture('toggleOn')
  }

  function toggleTopbarSound() {
    if (!soundAllowed) return setSound(true)
    const muted = !latest.current.muted
    update({ muted })
    if (!muted) playFromGesture('toggleOn')
  }

  return { preferences, defaultTier, effectsTier, soundAllowed, unlock, play, playFromGesture, toggle, setSound, toggleTopbarSound, update }
}

const ConsoleContext = createContext<ReturnType<typeof useConsoleControls> | null>(null)

export function ConsolePreferencesProvider({ children, visible }: { children: ReactNode; visible: boolean }) {
  const state = useConsoleControls(visible)
  return <ConsoleContext.Provider value={state}>{children}</ConsoleContext.Provider>
}

export function useConsolePreferences() {
  return useContext(ConsoleContext)
}

export function ConsoleSettingsControls() {
  const audio = useConsolePreferences()
  if (!audio) return null
  const { preferences, defaultTier, soundAllowed, setSound, toggle, update, unlock, playFromGesture } = audio
  return <>
    <label className="console-effects-setting">
      <span>Effects tier</span>
      <select value={preferences.effectsTier ?? ''} onChange={event => {
        update({ effectsTier: (event.currentTarget.value || null) as EffectsTier | null })
        playFromGesture('tab')
      }}>
        <option value="">Automatic ({defaultTier === 'balanced' ? 'Balanced' : 'Full'})</option>
        <option value="full">Full</option>
        <option value="balanced">Balanced</option>
        <option value="reduce">Reduce effects</option>
      </select>
    </label>
    <Switch on={preferences.centreShortcut} onToggle={() => toggle('centreShortcut')} label="Control Centre keyboard shortcut (C)" />
    <Switch on={preferences.startScreen} onToggle={() => toggle('startScreen')} label="Show start screen" />
    <Switch on={soundAllowed} onToggle={() => setSound(!soundAllowed)} label="Console sound" />
    {preferences.sound && !soundAllowed && <p className="text-[13px] text-muted">Sound is paused by your system motion preference.</p>}
    <Switch on={preferences.music} onToggle={() => toggle('music')} label="Ambient music" />
    <label className="console-volume">
      <span>Master volume</span>
      <input type="range" min={0} max={100} value={preferences.volume} onChange={event => {
        update({ volume: event.currentTarget.valueAsNumber })
        unlock()
      }} />
      <output>{preferences.volume}%</output>
    </label>
  </>
}
