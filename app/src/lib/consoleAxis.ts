const mantissas = [1, 2, 2.5, 5]

function positiveTicks(limit: number) {
  if (limit <= 0) return []
  const decade = Math.floor(Math.log10(limit))
  const ticks = []
  // Two decades give enough choices for dense axes and keep the neighbourhood
  // of zero clear. Cents are the smallest unit we label.
  for (let exponent = Math.max(0, decade - 1); exponent <= decade + 1; exponent++) {
    for (const mantissa of mantissas) {
      const value = mantissa * 10 ** exponent
      if (Number.isInteger(value)) ticks.push(value)
      if (value >= limit) return ticks
    }
  }
  return ticks
}

/** A linear cents axis with human-readable tick values and no duplicate labels. */
export function consoleAxis(minimum: number, maximum: number, target: number) {
  const low = positiveTicks(Math.abs(Math.min(0, minimum))).map(value => -value).reverse()
  const high = positiveTicks(Math.max(0, maximum))
  const min = low[0] ?? 0
  const max = high.at(-1) ?? (min === 0 ? 100 : 0)
  const range = [...low, 0, ...(high.length ? high : max ? [max] : [])]
  const space = (max - min) / (Math.max(2, target) - 1) * .7
  const ticks = [0]
  for (const direction of [-1, 1]) {
    let previous = 0
    for (const value of (direction < 0 ? [...low].reverse() : range.filter(v => v > 0))) {
      if (Math.abs(value - previous) < space && value !== min && value !== max) continue
      if ((value === min || value === max) && Math.abs(value - previous) < space * .5 && previous !== 0) {
        ticks.splice(ticks.indexOf(previous), 1)
      }
      ticks.push(value)
      previous = value
    }
  }
  return { min, max, ticks: ticks.sort((a, b) => b - a) }
}

export function formatConsoleTick(cents: number) {
  const dollars = Math.abs(cents) / 100
  const value = dollars >= 1_000_000 ? `${dollars / 1_000_000}m` : dollars >= 1_000 ? `${dollars / 1_000}k` : String(dollars)
  return `${cents < 0 ? '−' : ''}$${value}`
}
