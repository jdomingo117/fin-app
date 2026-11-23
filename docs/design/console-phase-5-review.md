# Console Phase 5 · Cross-screen qualification

| Reproduction field | Value |
| --- | --- |
| Branch | `codex/console-phase-5` |
| Application commit | `56b61bd6f486d11dfc865ee925dae4a3af827fa0` |
| Main base | `366297a`, approved Gate 4C merge |
| Worktree | `/Users/joel/Developer/fin-app` |
| Signed-in entry | [http://127.0.0.1:5320/dashboard](http://127.0.0.1:5320/dashboard) |

```sh
cd /Users/joel/Developer/fin-app/app
CHOKIDAR_USEPOLLING=1 VITE_BUDGET_V1_ENABLED=true npm run dev -- --host 127.0.0.1 --port 5320 --strictPort --force
```

![Console Home after signing in on the documented route](captures/console-phase-5/1440px-matrix-all-signed-in-surfaces/home-first-tile.jpg)

The listener’s working directory was this worktree’s `app/` directory. The test signed in through Halcyon, verified the fresh Classic appearance, and selected Console. The fixture intercepts Auth and report calls and uses fictional figures, a long merchant name, a Ledger row with no category source and a Budget reply without an estimate. Workflow checks save to the fictional API fixture. The owner’s account is reserved for the [read-only Safari review](console-phase-5-owner-checklist.md).

## Acceptance matrix

| Condition | Evidence and result |
| --- | --- |
| 320×740, touch | [First tile](captures/console-phase-5/320px-matrix-all-signed-in-surfaces/home-first-tile.jpg) · [Last tile and its ring](captures/console-phase-5/320px-matrix-all-signed-in-surfaces/home-last-tile.jpg) · [Settings](captures/console-phase-5/320px-matrix-all-signed-in-surfaces/settings.jpg) |
| 390×844, touch | [Overview](captures/console-phase-5/390px-matrix-all-signed-in-surfaces/overview.jpg) · [Long merchant in Ledger](captures/console-phase-5/390px-matrix-all-signed-in-surfaces/ledger-review.jpg) · [Start](captures/console-phase-5/390px-matrix-all-signed-in-surfaces/start.jpg) |
| 768×900, touch | [Accounts](captures/console-phase-5/768px-matrix-all-signed-in-surfaces/accounts.jpg) · [Income compact](captures/console-phase-5/768px-matrix-all-signed-in-surfaces/income-compact.jpg) · [Ingestion](captures/console-phase-5/768px-matrix-all-signed-in-surfaces/ingestion.jpg) |
| 1024×900, keyboard | [Control Centre](captures/console-phase-5/1024px-matrix-all-signed-in-surfaces/control-centre.jpg) · [Expenses](captures/console-phase-5/1024px-matrix-all-signed-in-surfaces/expenses.jpg) · [Transfers](captures/console-phase-5/1024px-matrix-all-signed-in-surfaces/transfers.jpg) |
| 1440×900, keyboard | [Home first tile](captures/console-phase-5/1440px-matrix-all-signed-in-surfaces/home-first-tile.jpg) · [Home last tile](captures/console-phase-5/1440px-matrix-all-signed-in-surfaces/home-last-tile.jpg) · [Budget](captures/console-phase-5/1440px-matrix-all-signed-in-surfaces/budget.jpg) |
| Actual Chrome 200% zoom | A 1440px browser window produced a 720px CSS viewport at DPR 2. [Control Centre](captures/console-phase-5/200-percent-browser-zoom/control-centre.jpg) · [Settings](captures/console-phase-5/200-percent-browser-zoom/settings.jpg) |
| Forced colours | Desktop and 390px passed axe and the rendered focus audit after the system-colour repairs. Switch tracks and thumbs now distinguish checked and unchecked states. Home’s explicit plus and minus signs remain readable in the monochrome palette. [Settings](captures/console-phase-5/all-signed-in-surfaces-in-forced-colours/settings.jpg) · [Phone Ledger](captures/console-phase-5/phone-all-signed-in-surfaces-in-forced-colours/ledger-review.jpg). |
| Reduced motion | Desktop and 390px passed the surface matrix with OS Reduce Motion. Separate cases passed for OS reduction, Reduce effects, and both together. OS reduction froze the particle canvas. Reduce effects removed the canvas and decorative blur. Startup used a 150 ms fade. [Reduced Control Centre](captures/console-phase-5/all-signed-in-surfaces-with-os-reduced-motion/control-centre.jpg). |
| Classic fallback | Fresh Classic rendered and navigated without page errors at desktop and phone widths. Switching to Console persisted. |
| Effects, sound and workflow regressions | 83 existing Console Playwright cases passed with one scheduled Desktop skip for a phone-only check. The sound cases exercised fresh/off, opt-in, reload before a gesture, trusted startup, mute, music, 55%/15%/zero output, unavailable Web Audio, OS reduction and explicit audio override. The fictional workflow cases covered Budget save and recovery, Ledger correction and focus return, Ingestion staging, and transfer confirmation. |
| Signed figures | Open. The isolated composited gradients, including four sampled cross-fades, cleared 4.5:1 for both signed colours. The lightest sampled figure backgrounds in the complete scene fell below that threshold. Spending’s negative colour reached **2.83:1** in the resting sample. [Pixel samples](captures/console-phase-5/signed-figure-contrast.json). |

The width runs cover Home’s first and last tile, four expanded and compact analysis hubs, Budget, Ledger, Ingestion, Transfers, Settings, the open Control Centre and the settled start screen. Keyboard and touch runs operate Home and the overlay, enter every hub, return Home, and confirm focus after start. Each capture uses the same fictional data and records the live route state. The computed audit additionally checks casing, module-title tokens, Classic accents and controls, house dates, Australian spelling, and focus. The 4C follow-up recorded 38 rendered states and ten focused controls with zero findings. The final forced-colours reruns recorded 36 states and 36 focus checks with zero findings. Forced-colour mode permits the system’s native accent. [Audit output with before and after runs](captures/console-phase-5/rendered-audit.json).

The [supplied reference](../../prototypes/Home%20%E2%80%94%20console%20UI-html/Main.dc.html) anchors the first and last tile at the left with a rounded selected silhouette and a separate edge. The signed-in captures follow that geometry and adapt the label below the tile on narrow layouts. The track’s bounding box stayed fixed across the focus change. The application uses its own responsive report modules and the approved 4B/4C workflow surfaces. With no Budget preview figure, the Home tile, label and placeholder repeatedly say “Budget” in the 320px capture. Review that wording against the owner’s actual Budget state. At 390px the Ledger search placeholder clips before the word “merchant” completes. The long record name is available in the row’s accessible name.

For motion regression review, the Console CSS entrances and dwell transitions use opacity, transform and filter. The start-wordmark layers have fixed letter spacing and use visibility and opacity for their handoff. The crisp ring and glow shadows are static. The JavaScript projection animates x/y and scale against measured bounds. The canvas redraws ambient particles without updating document layout. Shared chart code remains on its existing adapter and Console chart paths use their final-state or transform presentation.

Application and browser TypeScript checks, 731 offline tests and the production build passed. Vite reported its existing chunk-size advisory.

## Performance

Chrome 157.0.8103.80 on macOS 26.6.2. Desktop was 1440×900 at 100% zoom with no CPU or network throttle. Each run warmed the route sequence before tracing. The active tier and Reduce effects used matched five-second samples. The desktop sample moved the pointer, and the phone sample kept it centred. Ambient metrics are the active tier minus Reduce effects, using task CPU time and wall time where Chrome supplied only duration. The longest navigation value is renderer main-thread wall time.

| Chrome run | Longest navigation task | Ambient added mean | Ambient added p95 | Result |
| --- | ---: | ---: | ---: | --- |
| Foreground desktop, Full | **16.63 ms** | **6.58 ms/frame** | **7.82 ms/frame** | Navigation met ≤50 ms. Ambient exceeded ≤2/3 ms. [DevTools trace](traces/console-phase-5-desktop-headed-chrome.json.gz). |
| Headless desktop cross-check, Full | 16.27 ms | 3.94 ms/frame | 5.47 ms/frame | Same outcome. The Full window drew about 60 frames per second. [DevTools trace](traces/console-phase-5-desktop-chrome.json.gz). |
| Phone proxy, 390×844 at 4× CPU, Balanced | **83.96 ms** | 2.70 ms/frame | 3.53 ms/frame | Below the 200 ms reference. Trend evidence. [DevTools trace](traces/console-phase-5-phone-proxy.json.gz). |

The foreground Full sample was 6.93 ms mean and 9.16 ms p95. Its Reduce baseline was 0.35 ms mean and 1.34 ms p95. [Trace summary data](captures/console-phase-5/performance.json). The traces include rapid focus, dwell, all eight hub routes and Settings, Home return, Control Centre and start entry. The headless cross-check and phone trace were recorded before the Phase 5 forced-colour paint changes, with normal effects active.

Chrome automation kept the app marked visible during the real tab-switch and minimise attempts, even with focus emulation disabled. In a separate test at the same signed-in route, a simulated document visibility event stopped the beam and particle frames. The count held at 51 while hidden and rose to 71 after restoring visibility. The real background-tab check remains in the Safari checklist. [Visibility readings](captures/console-phase-5/visibility.json) · [Browser tab trace](traces/console-phase-5-visibility-chrome.json.gz) · [Simulated visibility trace](traces/console-phase-5-visibility-fixture-chrome.json.gz).

```sh
cd /Users/joel/Developer/fin-app/app
CONSOLE_QUALIFICATION_CAPTURE_DIR=../docs/design/captures/console-phase-5 npx playwright test -c playwright.console.config.ts console-phase-five
node --experimental-strip-types e2e/console-phone-proxy.mjs ../docs/design/traces/console-phase-5-desktop-headed-chrome.json.gz --desktop --headed Overview Accounts Income Expenses Budget 'Ledger review' Ingestion Transfers Settings Landing
node --experimental-strip-types e2e/console-phone-proxy.mjs ../docs/design/traces/console-phase-5-phone-proxy.json.gz Overview Accounts Income Expenses Budget 'Ledger review' Ingestion Transfers Settings Landing
```

## Decision

**Hold at the Phase 5 gate.** Desktop navigation passed. Desktop Full ambient CPU and the sampled figure-background contrast missed the spec. The owner’s Safari review is pending. The automated results and owner review inform the approval decision for the default switch.

The owner’s [read-only Safari checklist](console-phase-5-owner-checklist.md) and the [default switch, Classic removal and rollback proposal](console-rollout.md#proposed-default-switch-and-classic-removal) are ready for review. Classic remains the first-load default. The Ledger labels await the owner’s decision.
