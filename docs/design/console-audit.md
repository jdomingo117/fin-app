# Console appearance audit

22 November 2026 · Phase 1 · Halcyon at `609fc12`

The best starting point is the signed-in Dashboard. It already has the numbers a section preview can show, including net worth, 30-day inflow and spending, holdings, and recent activity. Moving between those previews can be a presentation change. Mounting Accounts, Expenses or Ledger to generate a preview would also start their reports and reset local state.

## What the checkout establishes

The app locks React 18.3.1, Vite 6.4.5, Tailwind 4.3.1, Framer Motion 11.18.2 and anime.js 3.2.2. React Router owns URLs. React contexts own authentication, financial data, Budget and view preferences. The section switcher can use those existing route and visibility decisions. [Frontend conventions](../../app/CLAUDE.md) · [Lockfile](../../app/package-lock.json) · [Router](../../app/src/router.tsx)

The house specification covers both appearances, typography, motion, accessible controls, responsive charts and financial workflows. Where its examples and the code differ, the shipping CSS and components establish the baseline. The global palette is hex/RGBA, with CSS colour mixing on some surfaces. The production shell scrolls inside each screen. A shared OKLCH section palette, horizontal snap-row primitive and named six-material scale were not found. A separate design-system source could resolve that discrepancy. [House specification](../../Halcyon_DesignSystem.md) · [Shipping CSS](../../app/src/index.css) · [Screen](../../app/src/components/Screen.tsx)

The working design export is [Main.dc.html](../../prototypes/Home%20%E2%80%94%20console%20UI-html/Main.dc.html). The owner confirmed it as the reference, with explicit §4 values taking precedence. Its CSS defines the visual transitions, `renderVals()` builds the tile track and gradient stops, and `sfx()` defines the Web Audio cues. The paired 1440px Budget captures reviewed earlier show the numbered rail, letterbox frame and a flat reading area. Dashboard still needs its own matched baseline.

### What the reference actually does

| Area | Observed | Consequence |
| --- | --- | --- |
| Anchor and activation | In headless Chromium at 1440×900 with OS reduced motion, Overview and the subsequently selected Accounts tile both measured 152×152px at x=57.59375px, y=109px. One click changed the prototype headline to Accounts. A second opened its dialog. | Use the focused tile's leading edge as the geometry assertion. Give keyboard focus the same ring. For Halcyon, mouse hover previews and one click opens. Touch uses two taps and keyboard uses arrows then Enter. |
| Preview and dwell | Selection keys the displayed section immediately. The 380ms timer updates `bgFor`. Until the first timer commits, a null `bgFor` falls back to the current selection. Ten gradient layers exist in the reference DOM. | The owner chose immediate figures/cards and a delayed background. Initialise the committed background to the initial section so the first move observes the same dwell as later moves. |
| Motion and colour | Rise uses 26px/800ms. Tiles enter 60ms apart, activity cards 80ms apart, sheet icons 35ms apart. The tile gradient varies chroma .15/.16/.12. The code animates tile dimensions, shadows, title tracking and equaliser bar height. | Take the reference offsets and timing within the brief's ranges. Use §4's constant tile chroma .15. Cross-fade fixed silhouettes and shadows and scale visual children. |
| Input and accessibility | Tile mouse-enter plays a hover tick. The prototype handles C inside the toolbar, renders the Control Centre without a modal focus trap, and collapses all reduced-mode entrances. | Define row-local keyboard and touch behaviour, a guarded global shortcut, a modal focus owner and the required 150ms reduced fade. |
| Sound | Master gain .55, compressor −18dB/3:1, reverb gain .32. Bell upper partial gains are .32 and .12 relative to the fundamental. The export starts with sound enabled and can request audio during hover. | Retain the synthesis recipe. Make gesture unlock, mute and opt-in explicit. Reuse its original four-note startup figure. |
| Content | The artboard uses hard-coded November balances, section names and quick actions including “Freeze card.” | Dashboard's scoped reports and the real route directory determine available previews and actions. Keep navigational hues distinct from category identity and financial status. |

## Tokens and shared styles

| Existing item | Decision | Consequence for the console appearance |
| --- | --- | --- |
| `--color-surface`, `--color-bar`, `--color-ink`, `--color-ink2`, `--color-muted`, `--color-faint` | Extend | Add scoped foreground/background pairs for luminous gradients. Use the current CSS values for baseline comparisons, including dark muted `#b8c1cb` and faint `#a7b0bb`. Measure text on the composited surface. |
| `--color-accent`, `--color-accent-ink`, `--accent-wash` | Keep | Settings writes accent custom properties directly to the root. Give section ambience its own hue so user-selected accent and readable link text retain their purpose. |
| `--color-pos/warn/neg`, `--color-blue/gold`, `--cat-1…13`, `--cat-unknown` | Keep and extend | Keep the chart/category assignments. Add scoped signed-figure colours for console readouts. Keep the explicit sign, period label and meaning of expense deltas, where a fall in spending can be favourable. |
| `--glass-fill`, `--glass-bd`, `--shadow-glass`, `--hair`, `--hair-soft`, `.glass` | Extend | Dark glass already uses 7.5% white fill. Its border is 11% white and its blur/saturation are 22px/120%. The requested 14% border and 24px/150% filter belong to a console surface variant. |
| `--track`, `--input-bg`, `--switch-off`, `--toast-bg`, `--workflow-control-border`, `.workflow-surface` | Keep | These establish readable popovers, form boundaries and dense-workflow surfaces. Test them when an ambient hue sits behind the workspace. |
| `--font-display`, `--font-body`, `.micro`, `.body-copy`, `.detail-copy`, `.field-label`, `.control-label`, `tabular-nums` | Extend | The font request loads Archivo 600/700/800/900 and Hanken Grotesk 400/500/600/700. Add real light weights for console roles. Keep the table and form reading sizes. A CSS weight of 200 alone cannot supply the missing font. |
| `.redacted .tabular-nums` | Keep | Redaction currently depends on a 7px blur. A blanket “Reduce effects” filter reset could expose balances. Retain redaction or use a masked value even with decorative blur disabled. |
| `--ease-halcyon`, Framer `cell`, `gridStagger`, `copyGroup` | Extend | The house curve is (.22, 1, .36, 1). The tile entrance takes 700ms with an 8px rise, 10px blur and 55ms sibling delay. Add a scoped motion scale with one source for CSS and JS consumers. |
| `:focus-visible`, `.scroll-region`, responsive grid and Budget spacing | Extend | Existing focus is a 2px accent-ink outline with 2px offset. Preserve a visible forced-colours fallback. Screen masks, row overflow and narrow gutters all affect the larger ring. Budget has its own spacing and panel-width variables. |
| `.outcome-panel`, `.data-table-wrap`, `.data-table`, operation-status family | Keep | These carry readable states, native table semantics and real progress. Focus decoration must leave the result, error and retry text visible. |

Sources include the [font request and first-paint theme bootstrap](../../app/index.html), [global styles](../../app/src/index.css), [motion variants](../../app/src/components/motion.ts), [Budget CSS](../../app/src/views/budget.css) and [Settings](../../app/src/views/Settings.tsx).

## Components and behaviour

| Existing item | Decision | Reason and integration point |
| --- | --- | --- |
| App frame, ViewContext, routing, auth/data/Budget providers | Extend the appearance boundary | `halcyon-theme` stores light/dark, the root gets `.dark`, and `motionOn` is in memory. Routes are keyed by pathname. Store a tile's return identity above that keyed subtree and clear route-local context on identity change. An appearance switch must preserve the current URL, draft and provider state. [App](../../app/src/App.tsx) |
| Shell, NAV, ThemeToggle | Extend | Shell already owns the primary rail, Settings, sign-out, review counts and sync footer. Budget docks its theme toggle in the footer. The Control Centre can reuse these actions and real counts. Carry the Budget navigation flag through to the new row. [Shell](../../app/src/components/Shell.tsx) |
| Screen, ViewHeader, Grid, Tile | Extend | Screen owns scrolling and edge masking. Tile is a noninteractive glass container with a Framer hover lift. Limit row focus to elements with a real action and give each transform a single owner. Keep nested chart controls and table rows individually operable. [Tile](../../app/src/components/Tile.tsx) |
| HeroCard, HeroMetric, Stat, Landing, Boot | Extend presentation | HeroCard shares its layout ID between Landing and Dashboard. Boot runs before routes and animates width. An optional start experience needs a separate signed-in entry decision so recovery, deep links and onboarding remain directly reachable. [HeroCard](../../app/src/components/HeroCard.tsx) · [Boot](../../app/src/components/Boot.tsx) |
| Dashboard, ReportStatus, ViewDataBoundary | Keep report owners, extend presentation | The view owns portfolio, cash-flow, monthly worth, ten recent lines and an on-demand parent lookup for the drawer. Key only the read-only presentation inside those owners. Keep loading, partial/error, empty, retry, transaction editing and links with category/date scope. [Dashboard](../../app/src/views/Dashboard.tsx) |
| Buttons, Switch, Chip, Select, DateInput, SearchInput, MoneyInput, MultiSelect, DateRangePicker, SegmentedRange/Tabs | Keep and extend | Share native semantics, labels, disabled and pressed states. Add console CTA/icon variants where appropriate. Arrow keys belong to the active composite. Typing in a filter must never open the Control Centre. [Controls](../../app/src/components/Controls.tsx) · [SegmentedTabs](../../app/src/components/SegmentedTabs.tsx) |
| SceneBackground and scene wash | Replace renderer under the flag | The present renderer is a 2D canvas plus a CSS wash. It observes OS and app motion, and still schedules draw frames when movement is off. Select one renderer per appearance. Suspend console work when a tab is hidden or a modal covers the scene. [SceneBackground](../../app/src/three/SceneBackground.tsx) |
| Area, Bar, AllocationDonut, CapacityMeter, projection charts | Keep | Chart motion uses the scoped v3 lifecycle, including final states and cleanup. Meter width and SVG geometry reveal are existing exceptions to the proposed compositor-only contract. The chart adapter stays on v3. Console effects use Framer Motion 11 and CSS. [Chart hook](../../app/src/hooks/useChartReveal.ts) · [CapacityMeter](../../app/src/components/CapacityMeter.tsx) |
| BudgetTaskPanel, useDialogFocus, transaction drawer and popovers | Keep | Budget's native modal owns focus and inertness. The existing hook traps Tab and restores focus for custom dialogs. Give the topmost overlay first claim on Escape. Keep console sheets outside the scroll mask. [BudgetTaskPanel](../../app/src/components/BudgetTaskPanel.tsx) · [Focus hook](../../app/src/hooks/useDialogFocus.ts) |
| MilestoneToast, OperationStatus, ProviderSyncNotice | Keep | The shell has actual attention counts and the provider notice has durable checkpoints. Reuse those sources for notifications without a second poller, invented events or duplicate live announcements. [ProviderSyncNotice](../../app/src/components/ProviderSyncNotice.tsx) |
| Sound and device preferences | Add | No production Web Audio cue engine was found. Keep the engine outside render, activate it by gesture, and let visible control state work when audio is muted, blocked or unavailable. |

## Decisions and design constraints

1. **Reference.** The local export supplies unspecified values. The brief governs differences in geometry, colour, reduced effects and sound. Hardware traces and Dashboard comparisons belong to implementation qualification.
2. **Motion ownership.** Use Framer Motion 11 and CSS with one token source. The v3 chart adapter and its callers remain in place. Anime.js v4 is a separate follow-up.
3. **Focus and dwell.** Start tile scale, track travel and the keyed preview together at focus change. After 380ms of stable focus, start the background cross-fade. Opening the section cancels pending dwell and navigates immediately.
4. **Geometry and text.** Growing a 96px tile to 152px consumes 56px beyond its slot. Reserve that space beside the anchored tile and test the name at 320px. A 13px radius scaled by 152/96 gives 20.58px, while the required endpoint is 18px. The owner approved two fixed silhouettes with an opacity transition. Likewise, cross-fade fixed tracking states for the title. The 14px card-row padding cannot contain a 46px glow with 14px spread, plus the scaled card. Protect the crisp ring and place decorative overflow in a separate unclipped layer.
5. **Appearance and audio.** The owner confirmed a dark Console alongside Classic light/dark, house light weights, and a stacked tile label when space is tight. Start screen, UI sounds and music are separate opt-ins. Initial master volume is 55%.

## Phase 2a evidence boundary

Evidence includes source, historical Budget captures and the local Chromium prototype geometry/activation check above. The Dashboard spike is for a feel review, with a local Chrome trace. Physical-device traces gate the ends of Phases 3 and 5. Check both signed-figure colours on each section background during hardening, including Expenses/Spending at 35° against the negative figure at 25°. Reposition or cap glows before considering a soft local gradient. Existing Playwright, axe, fictional-data concept pages and the responsive review checklist provide the verification tools. Pin a deterministic fixture and still frame for snapshots. Use live motion for traces. [Review checklist](../plans/DESIGN_REVIEW_CHECKLIST.md) · [Frontend inventory](../../INDEX.md)


## Phase 2b review findings

The Phase 2a band retained the classic frame, header and scrollable Dashboard below the preview. The Console viewport now owns Home, the ambient backdrop, and route-based hubs. The classic rail stays in Classic. Its existing 9+ badge can overlap the “06” index. Track that separately as a classic rail defect.

The Income mismatch was a date-scope presentation bug. The 30-day report queried the browser’s current local date minus 29 calendar days through today, 24 October to 22 November 2026 in the reported session. The Dashboard activity read sorted all available transaction dates. A read-only local check verified that the example salary posted on 30 September, the latest ledger date. The report correctly excluded it. In Console, Income and Spending cards now apply the same date bounds and reporting classifications. The preview names that date range and the latest transaction date. [Dashboard data owner](../../app/src/views/Dashboard.tsx) · [Scoped cash-flow contract](../../supabase/migrations/20261120010000_reporting_read_contracts.sql)


## Phase 2c design decision and findings

Console is the future default and the design target for shared components. Restyle those components in place for Console, including replacing their visual language where appropriate. Preserve component semantics, data ownership, chart values and existing keyboard alternatives. Freeze Classic as a fallback until its planned removal after Phase 5. Its remaining acceptance check is a smoke pass for rendering, navigation and browser console errors.

The Phase 2b hub wrapper put several unrelated tasks on one opaque panel. The two Income studies retain the ambient scene between 16px-radius modules. Dense content gets its own opaque reading surface. The studies also compare how much screen space goes to orientation versus analysis. [Phase 2c review](console-rollout.md#phase-2c--income-hub-directions)

The **“No settled outflows yet”** message shown beside **$3,140** in the Phase 2b Overview capture came from its fictional response. The fixture set the current gross and net expenses to 314,000 cents and returned an empty category array. Dashboard builds the spending insight from current category facets and shows the empty state when it finds zero eligible facets. The production report derives the category facets and total from the same settled expense records. The capture fixture explains the mismatch, so no application fix is indicated by that image. The Phase 2c studies derive their totals, daily series and breakdowns from the same fictional values. [Dashboard empty-state guard](../../app/src/views/Dashboard.tsx) · [Production report](../../supabase/migrations/20261120010000_reporting_read_contracts.sql)


The selected Phase 2c composition joins A’s entry hero to B’s module layout. Income starts in the Home preview’s 30-day window so the shared amount can carry across entry. Overview date and account filters use the existing cash-flow report for spending insights. The balance and valuation reads are portfolio-wide. [Selected layout](console-spec.md#selected-hub-composition)
