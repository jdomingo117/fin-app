import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Chip, Select, Switch } from '../Controls'
import { useView } from '../../router'
import { ConsoleModule } from './ConsoleHub'
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

export function ConsoleSettingsControls({ redact, toggleRedact }: { redact: boolean; toggleRedact: () => void }) {
  const audio = useConsolePreferences()
  const { setTheme, motionOn, setMotionOn } = useView()
  if (!audio) return null
  const { preferences, defaultTier, effectsTier, soundAllowed, setSound, toggle, update, unlock, playFromGesture } = audio
  const motionLocked = effectsTier === 'reduce'
  const soundStatus = soundAllowed && preferences.muted ? 'Muted by the top-bar speaker.'
    : preferences.sound && !soundAllowed ? 'Sound is paused by your system motion preference.'
    : undefined
  return <div className="console-settings-preferences">
    <ConsoleModule title="Appearance" kind="flat">
      <div className="console-settings-choices" role="group" aria-label="Appearance">
        <Chip active>Console</Chip>
        <Chip active={false} onClick={() => setTheme('classic')}>Classic</Chip>
      </div>
      <Switch on={redact} onToggle={toggleRedact} label="Redact balances" />
    </ConsoleModule>
    <ConsoleModule title="Effects and navigation" kind="flat">
      <label className="console-effects-setting">
        <span>Effects tier</span>
        <Select value={preferences.effectsTier ?? ''} onChange={value => {
          update({ effectsTier: (value || null) as EffectsTier | null })
          playFromGesture('tab')
        }}>
          <option value="">Automatic ({defaultTier === 'balanced' ? 'Balanced' : 'Full'})</option>
          <option value="full">Full</option>
          <option value="balanced">Balanced</option>
          <option value="reduce">Reduce effects</option>
        </Select>
      </label>
      <Switch on={motionOn && !motionLocked} disabled={motionLocked}
        describedBy={motionLocked ? 'console-ambient-motion-status' : undefined}
        onToggle={() => setMotionOn(!motionOn)} label="Ambient motion" />
      {motionLocked && <p id="console-ambient-motion-status" className="detail-copy">Reduce effects turns off ambient motion.</p>}
      <Switch on={preferences.startScreen} onToggle={() => toggle('startScreen')} label="Show start screen" />
      <Switch on={preferences.centreShortcut} onToggle={() => toggle('centreShortcut')} label="Control Centre keyboard shortcut (C)" />
    </ConsoleModule>
    <ConsoleModule title="Sound" kind="flat">
      <Switch on={soundAllowed} onToggle={() => setSound(!soundAllowed)} label="Console sound"
        describedBy={soundStatus ? 'console-sound-status' : undefined} />
      {soundStatus && <p id="console-sound-status" className="detail-copy">{soundStatus}</p>}
      <Switch on={preferences.music} onToggle={() => toggle('music')} label="Ambient music" />
      <label className="console-volume">
        <span>Master volume</span>
        <span className="console-volume-track"><input aria-label="Master volume" type="range" min={0} max={100} value={preferences.volume} onChange={event => {
          update({ volume: event.currentTarget.valueAsNumber })
          unlock()
        }} /></span>
        <output aria-hidden="true">{preferences.volume}%</output>
      </label>
    </ConsoleModule>
  </div>
}
