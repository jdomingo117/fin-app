---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-11-12
updated: 2026-11-12
related:
  - "[[BUDGET_TABLE_STAGE_1_PLAN]]"
  - "[[BUDGET_BUI_08A_MY_PLAN]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# Budget table — stage 1 checkpoint

Built to [[BUDGET_TABLE_STAGE_1_PLAN]], with the owner's three decisions: the tab stays
"My plan", goals and set-asides are separate groups, and Overview is unchanged.

## What shipped

- **Server:** `20261112020000_budget_sheet_totals.sql` adds `budget_sheet_facts`, a
  read-only SQL function. It returns per-group totals (planned, used, remaining, reserve,
  purchases, bank-confirmed) plus `allocated_cents` for the selected period's revision.
  Any unknown member makes that group field null. The existing
  `budget_workspace_details_uncached` is renamed to `_before_sheet` and wrapped, so the
  workspace composer picks up `details.sheet` unchanged. It has service-role-only
  privileges and ends with an assertion block. No table, command or Edge Function changes.
- **Adapter:** `budgetPresentation` exposes `sheet` as qualified values, plus a new
  per-item `spent` (from `used_cents`).
- **`lib/budgetSheet.ts`:** groups saved plan lines into rows. It does no money
  arithmetic, and computes split-bar display ratios from server figures only.
- **`components/budget/BudgetSheet.tsx`:** the read-only table. Category limits appear as
  child rows, groups with two or more lines get a total row, and the bottom summary shows
  expected income, one-off cash, total planned, and still to plan or funding gap. It also
  draws the money split bar with a plain equation. `BudgetPlan.tsx` now hosts it; the
  "Your saved plan" eyebrow was removed and the phase is stated in the lead sentence.
- **Phones (below 600px):** the table shows the item name plus one switchable column
  (Planned, Spent or Left), remembered per browser. It stays a real table rather than
  restyled blocks.

## Verification

All runs used fresh disposable candidate projects on 57521/57600
(`test-budget-durable.mjs --release-candidate --secondary-ports --workspace --plan-only`).
Each run's exact fixture cleanup passed. No personal stack, and not the retained
`halcyon-budget-m2-c65dd04871874dcb` preview on 57421, was touched.

- The final My plan run passed **128 checks**, including:
  - server group totals equal their rows, and `allocated_cents` equals the saved
    allocations;
  - group order, the set-aside total row, and the split bar's accessible sentence;
  - the phone column switch;
  - fit and no-clipping at 320, 390, 768, 1024 and 1440px in both themes, with
    current and future plans;
  - axe WCAG 2.1 AA scans with zero violations;
  - no writes from viewing;
  - existing edit entry, recovery and funding-gap behaviour.
- Captures are in `docs/budget-ui/budget-table-stage-1/captures/`.
- Unit tests, TypeScript and the production build pass. The new tests are
  `budgetSheet.test.ts` and `BudgetSheet.test.tsx`.

## Harness changes

- `--plan-only` now skips the R09 coverage pre-checks that candidate mode otherwise
  runs. Those hit a 429 rate limit on the first attempt, before reaching My plan.
- The "View allowance activity" step now opens "Category limits and moving money"
  first. The everyday rows moved inside that disclosure in the earlier Overview
  simplification, so the old step could no longer reach them.
- The My plan captures now go to `budget-table-stage-1/` so BUI-08a's evidence is left
  as it was.

## Not done

- The migration has **not** been applied to the personal local stack. That needs the
  owner's go-ahead, a recorded backup and the preflight in [[SYSTEM_INTEGRITY]].
- The full Budget lifecycle regression was not rerun. Only the My plan scope ran.
- Stages 2–4 (formula bar, editing in the table, months view) are not started.
