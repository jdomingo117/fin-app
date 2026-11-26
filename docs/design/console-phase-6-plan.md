# Console Phase 6 · prototype integration plan

Proposed 26 November 2026 · not yet approved. The owner makes the decisions in [Open decisions](#open-decisions) before Batch 6C starts.

Phase 6 brings the remaining interaction ideas from the owner's Console-style Finance Home prototype into the shipped Console. The prototype is a Claude Design canvas with one 1440 × 900 interactive artboard, `Main.dc.html`. It uses fictional figures and the placeholder name "Strata". Use it for structure and behaviour only. Never copy its figures, names or brand.

Phase 6 follows the [rollout](console-rollout.md) delivery rules: each batch branches from current `main`, stops at its gate and merges only after owner approval. Each new hub or top-level component also updates `INDEX.md`.

## Starting point

- Console became the default on `main` in PR #12, merge `c2fd2a0`. Tags `console-pre-default-switch` (`a74c30a`) and `console-default-switch` (`c2fd2a0`) mark the rollback releases.
- The default-switch observation window runs from 26 November to 10 December 2026 and includes the 30 November month-end. See [Observation](console-rollout.md#default-switch-observation).
- Phase 6 batches can be built and gated during observation. A batch merges during observation only with owner approval. Record each merged batch in the observation log, so a regression can be traced to the switch or to that batch.
- Classic stays available. Phase 6 is Console-only and doesn't restyle Classic.

## Gap summary

| Prototype | Console at `c2fd2a0` | Existing data |
| --- | --- | --- |
| Two home rows, Money and Plan, switched by large tab labels in the top bar | One row: Overview, Accounts, Income, Expenses and Budget (`components/console/sections.ts`) | Planning goals (`usePlanning`), recurring series (`useRecurrence`), holdings (`useInvestmentOverview`) |
| Four cards per section, with progress bars where a share or target exists | Accounts shows account cards. Overview, Income and Expenses show transaction cards. Budget renders an empty spacer (`ConsoleHome.tsx`). | Budget report, category totals, holdings |
| Hero ring showing progress toward a target | Ring shows the trend art (`ConsoleHeroArt`) | Planning goals |
| Control Centre notices that open the related tile | Ledger and Transfers attention cards (`ControlCentre.tsx`), counts from `usePortfolio` | Budget attention, recurring due dates, goal progress, uncategorised and transfer counts |
| Quick actions: Home, Transfer, Add expense, Quiet alerts, Music and Rest | Ledger review, Transfers, Ingestion, Settings, Music and Sign out | Transfer review route, start screen |
| Key hints: ← → Navigate · Enter Open · C Control centre | None | No data needed |

## Batches

### 6A · Home cards, ring and key hints

Uses existing data only. Start here.

- Budget's Home preview shows up to four category cards. Each shows spent of allocated, with a progress bar in exact cents, and the cards replace the spacer. Use the existing Budget report or its current-period cache. Don't add a read when the hub is cold. Show the existing unavailable and disabled states rather than a zero.
- Expenses' Home preview adds the top categories, with each category's share of spending as a bar, next to the current activity cards. The shares must reconcile with the Expenses hub.
- Overview's ring shows progress toward one planning goal when the owner nominates one. Otherwise it keeps the trend art.
- Add a key-hint strip on Home, shown for fine pointers only, with labels that match the actual bindings. Hide it while C is turned off in Settings, or label the shortcut as off.
- Gate: Home captures for each section at 320, 390, 768, 1024 and 1440, the rendered leftover audit, axe, and a matched Full and Reduce effects desktop trace against the Phase 5 limits.

### 6B · Control Centre notices and actions

- Build notice cards from real signals only:
  - Budget items in attention;
  - recurring series due in the next 14 days;
  - goal milestones;
  - never-categorised transactions;
  - the transfer review queue.

  Rank them in a fixed order and show at most three. Each opens its hub with the matching state. With no signals, show an all-caught-up state instead of an empty strip.
- Quick actions:
  - add **Rest**, which returns to the start screen when it's enabled;
  - add **Quiet alerts**, which mutes Console toasts for the session;
  - keep Ledger review, Transfers, Ingestion, Settings, Music and Sign out unless the owner's 6C decision moves them;
  - add **Add transaction** only if manual entry already has an Edge Function path, without any new write paths.
- Keep the existing focus trap, focus return, Escape, shortcut guards and Safari wrap regression green.
- Gate: Control Centre captures with zero, one and three notices at desktop and phone widths, keyboard and touch walkthroughs, and the Phase 5 owner-fixes focus regression in Chromium and WebKit.

### 6C · Money and Plan rows

Needs the owner's decisions first.

- Split the section row into two labelled rows, each its own `FocusRow` with its own roving tab stop and a visible tab control. Preserve deep links, Back to the same tile and restore-focus behaviour.
- Money keeps Overview, Accounts, Income, Expenses and Budget, plus Investments if the owner chooses it.
- Plan adds Goals and Bills hubs built on `usePlanning` and `useRecurrence`, using the ConsoleHub expanded-and-compact language. Write through the existing `manage-planning` and `manage-recurring-series` Edge Functions only.
- Each new hub needs empty, error and redacted states, and must never show a fabricated zero.
- Gate: the full Phase 5 cross-screen matrix for the changed rows and new hubs, plus a 30-second walkthrough across both rows.

## Out of scope

- Freeze card, Pay a bill and moving money: Halcyon reads and reconciles accounts and has no payment rails.
- Super, Tax time and Reports tiles, until their data exists. Super could later be an account type. Tax could start from the investment tax records. Export would need its own feature.
- The prototype's boot-sound melody and music. The shipped `SoundEngine` keeps its own recipes unless the owner asks for a cue comparison.

## Open decisions

1. Should Ledger, Transfers and Ingestion get a third home row, or stay in Control Centre?
2. Should Investments be its own Money tile, or stay inside Accounts?
3. Which planning goal, if any, should the Overview ring track?
4. Are Goals and Bills the right first Plan hubs?
