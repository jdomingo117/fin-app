import { useSyncExternalStore } from 'react'

export const effectsTiers = ['full', 'balanced', 'reduce'] as const
export type EffectsTier = (typeof effectsTiers)[number]

type DeviceSignals = Navigator & { deviceMemory?: number; connection?: EventTarget & { saveData?: boolean } }
const coarsePointer = '(pointer: coarse)'
const lowPowerLimit = 4

function getDefaultTier(): EffectsTier {
  const device = navigator as DeviceSignals
  const small = (value?: number) => typeof value === 'number' && value > 0 && value <= lowPowerLimit
  return matchMedia(coarsePointer).matches || small(device.deviceMemory)
    || small(device.hardwareConcurrency) || device.connection?.saveData === true ? 'balanced' : 'full'
}

function subscribe(listener: () => void) {
  const pointer = matchMedia(coarsePointer)
  const connection = (navigator as DeviceSignals).connection
  pointer.addEventListener('change', listener)
  connection?.addEventListener('change', listener)
  return () => {
    pointer.removeEventListener('change', listener)
    connection?.removeEventListener('change', listener)
  }
}

export function useDefaultEffectsTier() {
  return useSyncExternalStore(subscribe, getDefaultTier, (): EffectsTier => 'full')
}
