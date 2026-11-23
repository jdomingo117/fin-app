import { expect, test, type Locator } from '@playwright/test'

/** Audit rendered chrome on the signed-in route. Text supplied by financial
 * records can opt out of casing with data-console-record-label. */
export async function collectConsoleChrome(root: Locator) {
  return root.evaluate(scope => {
    const issues = { casing: [] as string[], moduleTitles: [] as string[], accents: [] as string[],
      controls: [] as string[], defaultAccents: [] as string[], defaultOutlines: [] as string[],
      focusRings: [] as string[], dates: [] as string[], spelling: [] as string[] }
    const checked = { labels: 0, moduleTitles: 0, controls: 0, accentControls: 0, focusedElements: 0, focusRings: 0, textNodes: 0, spelling: 0 }
    const ignored = '[aria-hidden="true"], [hidden], [inert]'
    const visible = (element: Element) => !element.closest(ignored) && element.getClientRects().length > 0
      && getComputedStyle(element).visibility === 'visible'
    const description = (element: Element) => {
      const labels = element instanceof HTMLInputElement ? [...(element.labels ?? [])].map(label => label.textContent).join(' ') : ''
      return (element.getAttribute('aria-label') || labels || element.textContent || element.tagName)
        .replace(/\s+/g, ' ').trim().slice(0, 100)
    }
    const allowedAcronyms = new Set(['CSV', 'AUD', 'USD', 'FY', 'YTD', 'ID', 'NAV', 'API', 'ETF', 'GST', 'PDF', 'OFX', 'OK', 'HALCYON', 'UP'])
    const properNouns = /\b(?:Back to Home|Control Centre|Halcyon|HALCYON|Strategic projections|Up Bank|High-interest savings|Net Worth|Market Grocer|New South Wales)\b/g
    const designLabel = 'button, a, label, [role="tab"], [role="columnheader"], [role="rowheader"], th, legend, summary, h1, h2, h3, h4, h5, h6, option, [data-console-label]'
    const recordLabel = '[data-console-record-label], .console-ledger-list, .console-activity-card, .react-flow__node, .console-chart-values table'
    const classicAccent = /(?:#(?:11b596|08735f|16c7a4|3ad9bd)\b|rgb\(\s*(?:17,\s*181,\s*150|8,\s*115,\s*95|22,\s*199,\s*164|58,\s*217,\s*189)\s*\))/i
    const date = /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])(?:-\d{2})?\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.? (?:[1-9]|[12]\d|3[01])\b/i
    const usSpelling = /\b(?:(?:re|un)?categoriz\w*|analyz\w*|behaviors?|favorites?|color(?:s|ed|ing)?|centers?|cancel(?:ed|ing)|label(?:ed|ing)|model(?:ed|ing)|(?:author|custom|initial|local|normal|organ|person|priorit|recogn|special|standard|summar|synchron|visual)iz\w*)\b/gi
    const forcedColours = matchMedia('(forced-colors: active)').matches
    const keyTarget = 'button, a, input, select, textarea, summary, [data-focus-ring], [tabindex], [role="button"]'
    function checkSpelling(value: string) {
      checked.spelling++
      issues.spelling.push(...(value.match(usSpelling) ?? []))
    }
    function hasFocusRing(element: Element, style: CSSStyleDeclaration) {
      const tile = element.matches('.console-section')
      const edge = tile ? element.querySelector('.console-focus-decoration[data-layer="edge"]') : element
      if (!edge) return false
      const ink = getComputedStyle(edge)
      if (tile && style.outlineStyle !== 'none') return false
      if (forcedColours) {
        return ink.outlineStyle === 'solid' && ink.outlineWidth === '2px' && ink.outlineOffset === '3px'
      }
      if (ink.outlineStyle !== 'none') return false
      const scale = tile ? edge.getBoundingClientRect().width / (edge as HTMLElement).offsetWidth : 1
      const shadows = [...ink.boxShadow.matchAll(/(rgba?\([^)]+\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+([\d.]+)px/g)]
      const spread = (shadow: RegExpMatchArray, expected: number) =>
        Number(shadow[2]) === 0 && Number(shadow[3]) === 0 && Number(shadow[4]) === 0
        && Math.abs(Number(shadow[5]) * scale - expected) < 0.15
      const rounded = (!tile && !element.closest('.console-settings-preferences')) || parseFloat(ink.borderRadius) > 0
      return rounded && (!tile || Number(ink.opacity) > .99) && !ink.boxShadow.includes('inset')
        && shadows.length === 2 && spread(shadows[0], 3) && spread(shadows[1], 6)
        && shadows[0][1] === 'rgba(6, 8, 16, 0.85)' && shadows[1][1] === 'rgb(255, 255, 255)'
    }
    function checkRenderedCase(value: string, textStyle: CSSStyleDeclaration) {
      const text = value.replace(/\s+/g, ' ').trim()
      const words = text.replace(properNouns, '').match(/[A-Za-z][A-Za-z'-]*/g) ?? []
      const principal = words.filter(word => !allowedAcronyms.has(word))
      if (!principal.length) return
      const transforms = textStyle.textTransform.split(' ')
      if (transforms.includes('uppercase') || /(?:small|petite)-caps/.test(textStyle.fontVariantCaps)) {
        issues.casing.push(text.toUpperCase())
      } else if (transforms.includes('capitalize') && principal.length > 1) {
        issues.casing.push(text.replace(/\b\p{L}/gu, letter => letter.toUpperCase()))
      }
    }
    const titleProbe = document.createElement('span')
    titleProbe.className = 'console-module-title'
    rootAppend(titleProbe)
    const reference = getComputedStyle(titleProbe)
    const titleFont = [reference.fontFamily, reference.fontWeight, reference.fontSize, reference.lineHeight].join('|')
    titleProbe.remove()

    function rootAppend(element: Element) { scope.appendChild(element) }
    for (const element of [scope, ...scope.querySelectorAll('*')]) {
      if (!visible(element)) continue
      const style = getComputedStyle(element)
      if (!element.closest(recordLabel)) {
        for (const attribute of ['aria-label', 'aria-description', 'placeholder', 'title']) {
          const value = element.getAttribute(attribute)
          if (value) checkSpelling(value)
        }
      }
      if (element.matches(designLabel) && !element.closest(recordLabel)) {
        const text = description(element)
        const words = text.replace(properNouns, '').replace(/\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi, '').match(/[A-Za-z][A-Za-z'-]*/g) ?? []
        const principal = words.filter(word => !/^(?:and|to|the|of|for|in|or|a|by|on|with|vs)$/i.test(word) && !allowedAcronyms.has(word))
        checked.labels++
        const uppercase = principal.length > 0 && principal.every(word => /^[A-Z]{2,}$/.test(word))
        const titleCase = principal.length >= 2 && principal.every(word => /^[A-Z][a-z]+$/.test(word))
        if (uppercase || titleCase) issues.casing.push(text)
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
      if (element.matches('select') && (!element.classList.contains('native-select') || style.appearance !== 'none')) {
        issues.controls.push(`Native select: ${description(element)}`)
      }
      if (element.matches('input:is([type="checkbox"], [type="radio"], [type="range"]), progress')) {
        checked.accentControls++
        if (style.accentColor === 'auto') issues.defaultAccents.push(description(element))
      }
      if (element.matches(':focus')) {
        checked.focusedElements++
        if (style.outlineStyle === 'auto' && parseFloat(style.outlineWidth) > 0) {
          issues.defaultOutlines.push(description(element))
        }
      }
      if (element.matches(':focus-visible') && element.matches(keyTarget)
        && !element.matches('h1,h2,h3,h4,h5,h6')) {
        checked.focusRings++
        if (!hasFocusRing(element, style)) issues.focusRings.push(description(element))
      }
      if ([style.color, style.backgroundColor, style.borderTopColor, style.outlineColor, style.fill, style.stroke].some(color => classicAccent.test(color))) {
        issues.accents.push(description(element))
      }
      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue
        checked.textNodes++
        const match = node.textContent.match(date)
        if (match) issues.dates.push(match[0])
        if (!element.closest(recordLabel)) {
          checkRenderedCase(node.textContent, style)
          checkSpelling(node.textContent)
        }
      }
      if (element.matches(`${designLabel}, [data-label]`) && !element.closest(recordLabel)) {
        for (const side of ['::before', '::after']) {
          const pseudo = getComputedStyle(element, side)
          if (pseudo.display === 'none' || pseudo.visibility !== 'visible') continue
          const content = pseudo.content.match(/^"(.*)"$/)?.[1]
          if (content) {
            checkRenderedCase(content, pseudo)
            checkSpelling(content)
          }
        }
      }
    }
    return { checked, issues: Object.fromEntries(Object.entries(issues).map(([key, values]) => [key, [...new Set(values)]])) }
  })
}

export async function auditConsoleChrome(root: Locator, state: string) {
  const findings = await collectConsoleChrome(root)
  await test.info().attach(`Console leftovers – ${state}`, { body: JSON.stringify(findings, null, 2), contentType: 'application/json' })
  console.log(`${state} leftovers ${JSON.stringify(findings)}`)
  expect.soft(findings.issues, state).toEqual({ casing: [], moduleTitles: [], accents: [], controls: [],
    defaultAccents: [], defaultOutlines: [], focusRings: [], dates: [], spelling: [] })
}
