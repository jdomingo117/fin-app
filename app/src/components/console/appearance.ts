import { confirmAppearanceChange } from '../../hooks/useUnsavedChanges'
import { useCallback, useLayoutEffect, useState } from 'react'

export type Appearance = 'classic' | 'console'

const appearanceKey = 'halcyon-appearance'
const classicThemeKey = 'halcyon-theme'

function readPreference(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

function writePreference(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* The selection still applies to this tab. */ }
}

/** Console is the default. Only an explicitly saved Classic choice keeps the fallback appearance. */
export function initialAppearance(saved: string | null): Appearance {
  return saved === 'classic' ? 'classic' : 'console'
}

export function useAppearancePreferences() {
  const [theme, setAppearance] = useState<Appearance>(() => initialAppearance(readPreference(appearanceKey)))
  const [dark, setClassicDark] = useState(() => readPreference(classicThemeKey) === 'dark')
  const setTheme = useCallback((appearance: Appearance) => {
    if (appearance === theme || !confirmAppearanceChange()) return
    setAppearance(appearance)
    writePreference(appearanceKey, appearance)
  }, [theme])
  const setDark = useCallback((enabled: boolean) => {
    setClassicDark(enabled)
    writePreference(classicThemeKey, enabled ? 'dark' : 'light')
  }, [])
  return { theme, setTheme, dark, setDark }
}

export function useAppearanceDocument(appearance: Appearance, dark: boolean) {
  useLayoutEffect(() => {
    const root = document.documentElement
    if (appearance === 'console') root.dataset.theme = 'console'
    else delete root.dataset.theme
    root.classList.toggle('dark', dark)
  }, [appearance, dark])
}
