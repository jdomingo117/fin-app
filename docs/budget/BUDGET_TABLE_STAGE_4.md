---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-11-18
updated: 2026-11-18
related:
  - "[[BUDGET_TABLE_STAGE_3B]]"
  - "[[BUDGET_TABLE_STAGE_1_PLAN]]"
---

# Budget table — stage 4: month by month in Look back

## What shipped

- **Server**: migration `20261118000000_budget_months.sql` adds `budget_months`, a
  read-only, service-role-only function.
  - For the selected budget period and up to 11 before it, it returns each saved line's
    planned, used, remaining and reserve figures, plus the goal target.
  - It calls the existing `budget_details_m4` for each period, using the same history
    checkpoints as the workspace, so every figure is one the app already shows for that
    period.
  - It checks the source revision, membership and plan version first. It adds no table,
    command or persisted state.
- **Edge**: `query-budget` has a new Zod-validated `months` action. It returns 503
  `months_unavailable` on timeout or lock.
- **Client**:
  - `lib/budgetMonths.ts` (`budgetMonthsRows`) builds one row per line, named as in its
    latest period. A line missing from a period is "absent", never zero. It does no money
    arithmetic: cell shading is a display ratio only.
  - `components/budget/BudgetMonths.tsx` renders a read-only table in Look back.
    - Items are rows and budgets are columns. The selected budget is marked
      `aria-current`.
    - Bills and everyday cells show used and "of planned", with an "over" label when
      over plan. Set-aside and goal cells show the amount saved, and goal cells also
      show the target.
    - The first column is sticky inside a scroll region, so a phone scrolls sideways
      within the table, not the page.
- **Read budget**: `query-budget` allows 30 reads a minute. The months view reads once
  each time Look back is opened, and again only on "Update month by month". Changes or a
  period switch while it's open show a "may be out of date" line instead of reading
  again. Reading again automatically starved the page's own refreshes in the Look back
  run.

## Verification

- Unit tests in `budgetMonths.test.ts` cover grouping and naming, absent versus zero,
  used of planned with an over flag, goals against their targets, and unknown values
  staying unavailable.
- `--lookback-only` on a disposable candidate project passed **219 checks**, with fit and
  axe AA at 320–1440px in both themes. The new checks:
  - the months heading, rows, columns and current marker;
  - a direct `budget_months` read returns the saved line with no writes;
  - the `authenticated` role is denied direct execution.
- Test fixes needed on the way:
  - Look back now holds two tables, so the existing lookups in `test-budget-lookback.mjs`
    and `test-budget-m5-interactions.mjs` now target `table.data-table`.
  - `--lookback-only` skips the R09 coverage pre-checks, which hit the 429 rate limit.
  - Two contrast fixes: the "of" line uses `--color-ink2`, and over-plan figures use ink
    text on a red tint with a visible "over" word.
