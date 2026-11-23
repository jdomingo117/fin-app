import { expect, test, type Locator } from '@playwright/test'

/** Audit rendered chrome on the signed-in route. Text supplied by financial
 * records can opt out of casing with data-console-record-label. */
export async function auditConsoleChrome(root: Locator, state: string) {
  const findings = await root.evaluate(scope => {
    const issues = { casing: [] as string[], moduleTitles: [] as string[], accents: [] as string[],
      controls: [] as string[], dates: [] as string[] }
    const checked = { labels: 0, moduleTitles: 0, controls: 0, textNodes: 0 }
    const ignored = '[aria-hidden="true"], [hidden], [inert]'
    const visible = (element: Element) => !element.closest(ignored) && element.getClientRects().length > 0
      && getComputedStyle(element).visibility === 'visible'
    const description = (element: Element) => (element.getAttribute('aria-label') || element.textContent || element.tagName)
      .replace(/\s+/g, ' ').trim().slice(0, 100)
    const allowedAcronyms = new Set(['CSV', 'AUD', 'USD', 'FY', 'YTD', 'ID', 'NAV', 'API', 'ETF', 'GST', 'PDF', 'OFX', 'OK', 'HALCYON', 'UP'])
    const properNouns = /\b(?:Back to Home|Control Centre|Strategic projections|Up Bank|High-interest savings|Net Worth|Market Grocer|New South Wales)\b/g
    const designLabel = 'button, a, label, [role="tab"], legend, summary, h1, h2, h3, option, [data-console-label]'
    const classicAccent = /(?:#(?:11b596|08735f|16c7a4|3ad9bd)\b|rgb\(\s*(?:17,\s*181,\s*150|8,\s*115,\s*95|22,\s*199,\s*164|58,\s*217,\s*189)\s*\))/i
    const date = /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])(?:-\d{2})?\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.? (?:[1-9]|[12]\d|3[01])\b/i
    const titleProbe = document.createElement('span')
    titleProbe.className = 'console-module-title'
    rootAppend(titleProbe)
    const reference = getComputedStyle(titleProbe)
    const titleFont = [reference.fontFamily, reference.fontWeight, reference.fontSize, reference.lineHeight].join('|')
    titleProbe.remove()

    function rootAppend(element: Element) { scope.appendChild(element) }
    for (const element of scope.querySelectorAll('*')) {
      if (!visible(element)) continue
      const style = getComputedStyle(element)
      if (element.matches(designLabel) && !element.closest('[data-console-record-label], .console-ledger-list, .console-activity-card, .react-flow__node, .console-chart-values table')) {
        const text = description(element)
        const words = text.replace(properNouns, '').replace(/\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi, '').match(/[A-Za-z][A-Za-z'-]*/g) ?? []
        const principal = words.filter(word => !/^(?:and|to|the|of|for|in|or|a|by|on|with|vs)$/i.test(word) && !allowedAcronyms.has(word))
        checked.labels++
        const uppercase = principal.length > 0 && principal.every(word => /^[A-Z]{2,}$/.test(word))
        const titleCase = principal.length >= 2 && principal.every(word => /^[A-Z][a-z]+$/.test(word))
        if (uppercase || titleCase || (style.textTransform === 'uppercase' && principal.length)) issues.casing.push(text)
      }
      if (element.matches('[data-module-title], .console-module > header h2')) {
        checked.moduleTitles++
        if ([style.fontFamily, style.fontWeight, style.fontSize, style.lineHeight].join('|') !== titleFont) {
          issues.moduleTitles.push(description(element))
        }
      }
      if (element.matches('select, textarea, input:not([type="checkbox"],[type="radio"],[type="range"],[type="hidden"],[type="file"]), [data-control-kind="chip"]')) {
        checked.controls++
        if (style.getPropertyValue('--console-control-variant').trim() !== 'console' || !parseFloat(style.borderRadius)) {
          issues.controls.push(description(element))
        }
      }
      if ([style.color, style.backgroundColor, style.borderTopColor, style.outlineColor, style.fill, style.stroke].some(color => classicAccent.test(color))) {
        issues.accents.push(description(element))
      }
      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue
        checked.textNodes++
        const match = node.textContent.match(date)
        if (match) issues.dates.push(match[0])
      }
    }
    return { checked, issues: Object.fromEntries(Object.entries(issues).map(([key, values]) => [key, [...new Set(values)]])) }
  })
  await test.info().attach(`Console leftovers – ${state}`, { body: JSON.stringify(findings, null, 2), contentType: 'application/json' })
  console.log(`${state} leftovers ${JSON.stringify(findings)}`)
  expect.soft(findings.issues, state).toEqual({ casing: [], moduleTitles: [], accents: [], controls: [], dates: [] })
}
