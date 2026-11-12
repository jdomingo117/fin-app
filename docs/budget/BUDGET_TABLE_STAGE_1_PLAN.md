---
tags: [halcyon, budgeting, design, engineering]
type: implementation-plan
status: approved-for-build
project: Halcyon
created: 2026-11-12
updated: 2026-11-12
related:
  - "[[BUDGET_BUI_08A_MY_PLAN]]"
  - "[[SYSTEM_INTEGRITY]]"
  - "[[INDEX]]"
---

# Budget table — stage 1: a read-only table on My plan

## In one paragraph

Replace the plain list on **My plan** with one table that shows the whole budget
at once: every bill, everyday allowance, set-aside, goal and planned transfer as a
row, grouped, with **Planned**, **Spent** and **Left** columns, a subtotal per
group and a bottom line that says how much is still to plan. Above it, one bar
shows where the income goes. Nothing in this stage changes how money is
calculated or saved: the table only shows figures the server already produces,
plus a small set of server-calculated group totals.

## Why

The Budget page tells its story in sentences and fold-outs. The figures that make
a budget understandable — income, what each job gets, what's been used, what's
left — are spread across the hero, a collapsed "Income & allocations" section,
the everyday rows, the bills fold-outs and the goal cards. Bills show only their
planned amount. The equation "money in − money given a job = still to plan" never
appears in one line. Every common budget template (YNAB, Monarch, Actual Budget,
Tiller, Vertex42) is built around exactly that table and that equation.

My plan is the natural home: today it lists saved allocations only (BUI-08a), so
the table adds information without removing any. Overview stays as the friendly
summary.

## Scope

**In:** the read-only table, the money split bar, group subtotals and the totals
row on My plan; one additive server read for group totals; tests; docs.

**Out (later stages):** the formula bar and "may be incomplete" corner markers
(stage 2); typing amounts into the table, setup and auto-build use (stage 3);
the month-by-month Look back view (stage 4); a pace tick in rows (stage 2, with
the formula bar). Overview, the editor, setup, assistance and every command stay
exactly as they are.

## What the table shows

Rows are grouped. Each group is its own `<tbody>` with a header row that carries
the group subtotal. Row order inside a group follows the saved line order.

| Group | Rows come from | Planned | Spent | Left |
|---|---|---|---|---|
| **Bills and regular payments** | `items` with `kind:'fixed'`, not goals | `planned_cents` | `used_cents` (matched charges) | `remaining_cents` |
| **Everyday spending** | the everyday pool; with category limits on, one row per limit plus "Other everyday" | pool / limit `planned` | pool / limit `used` | pool / limit `remaining` (includes carry and moves) |
| **Set aside** | `items` with `kind:'reserve'`, not goals | `planned_cents` | `net_purchases_cents` | `reserve_cents`, labelled "Set aside so far" |
| **Goals** | `items` with `config.type:'goal'` | `planned_cents` | `net_purchases_cents` | `reserve_cents` of `target`, labelled "Saved so far" |
| **Planned transfers** | `items` with `kind:'contribution'` | `planned_cents` | — | `bank_confirmed_cents`, labelled "Confirmed" |

All values go through the existing `budgetPresentation` adapter as qualified
`BudgetValue`s and render with the existing `BudgetValue` component, so
"Unavailable", stale and partial-history handling come for free and nothing falls
through to zero. Empty groups are left out, except that a plan with no bills shows
one quiet row with the existing "Find bills in my spending" action.

**Column meaning differs for set-asides, goals and transfers** ("Left" would be
misleading for money being built up). The group header row restates the third
column's label for that group, and screen readers get it from the group's own
header cells, so each group reads correctly on its own.

**Small status text under the name** reuses wording that already exists in
`BudgetCommitments` and `BudgetGoals`: "Paid 1 Nov" / "Due 18 Nov" for bills
(from `occurrences`), "Paused", "Draft", "Archived · history preserved",
"Needed by …" for goals, and "Over by $X" when Left is negative. No new status
logic.

**A thin progress bar** in each row shows Spent against Planned (bills, everyday)
or Saved against target (goals), styled like the existing everyday meter. It is
decorative (`aria-hidden`); the numbers carry the meaning.

### The bottom of the table

| Row | Value | Source |
|---|---|---|
| Expected income | `income.expected` | existing |
| Existing cash to use once | `income.cashOnce`, only when non-zero | existing |
| Total planned | new `sheet.allocated_cents` | new server total |
| Still to plan / Funding gap | `income.unallocated`, red and relabelled when negative | existing |

The continuing (future) plan stays in its existing "See saved future allowances"
disclosure below the table, unchanged.

### The money split bar

One horizontal bar above the table: Bills, Everyday, Set aside and goals,
Transfers, and a dashed "No job yet" segment, each as a share of expected
resources (income plus one-off cash). A single line above it reads
"$4,200 in − $3,565 planned = $635 still to plan". With a funding gap the dashed
segment becomes a red "Over by $X" segment past the end of the bar. A text legend
sits under the bar, and the bar itself is `role="img"` with the same sentence as
its label. If any group total is unavailable, the bar is not drawn and the
equation line says why, using the existing qualification wording.

Segment widths are display ratios computed in a new pure helper (like
`budgetForecastComparison.ts`); it never produces a money amount.

## Server change (one additive read)

BUI-08a deliberately added **no client-side totals**, and Law 2 keeps aggregates
in SQL, so group subtotals come from the server.

- New migration `2026111x000000_budget_sheet_totals.sql`: a function
  `budget_sheet_facts(p_tenant, p_actor, p_plan, p_period, p_source, p_version, d)`
  that reads the `items` / `limits` already in the details payload `d` and returns:
  `{groups:[{key, planned_cents, used_cents, remaining_cents, reserve_cents}],
  allocated_cents}`.
- Any member value that is null makes that group field null. **Unknown is never
  summed as zero.** Archived and voided lines follow the same rules as the
  existing reads.
- `budget_workspace_details_uncached` appends it the same way it appends
  `forecast` and `attention`: `d || jsonb_build_object('sheet', …)`.
- Same privileges as its siblings: revoke from `PUBLIC`, `anon` and
  `authenticated`, grant to `service_role`, and end with the usual `DO $$`
  privilege assertion block.
- `query-budget` passes `details` through untouched, so no Edge Function or Zod
  change is needed. This is a read; no command changes.
- Client: add `sheet?` to `BudgetDetails`, and expose it from `budgetPresentation`
  as qualified values (`basis:'plan'` for planned and allocated, `'recorded'` for
  used, `'budget-balance'` for remaining and reserve), with the same freshness,
  coverage and compatibility rules as every other value.

## Front-end changes

- `components/budget/BudgetSheet.tsx` — the table, the split bar and the bottom
  rows. Replaces the body of `BudgetPlan.tsx`; the "Adjust plan" button,
  "View allowance activity", the stale notice and the future-plan disclosure stay.
- `lib/budgetSheet.ts` — row mapping from the presentation model (no arithmetic)
  and split-bar ratios.
- `views/budget.css` — table styles built on the existing `.data-table` and
  tokens: tabular numbers, right-aligned money, sticky header within the section,
  quiet group rows on `--hair-soft`, light and dark themes.
- **Keep the existing test hooks**: `data-plan-line="<id>"` on each row and the
  `data-budget-value` names `plan-income`, `plan-cash-once` and
  `plan-unallocated`, so `test-budget-plan.mjs`, `test-budget-candidate.mjs` and
  `test-budget-hero.mjs` keep their meaning.

## Phones and accessibility

- A real `<table>` with a `<caption>`, `th scope="col"` headers, a `th scope="row"`
  for each item name and a `th` group header per `<tbody>`. No `role="grid"`; it's
  read-only.
- **Below 600px** the table shows Item, Planned and one switchable third column.
  A two-option control above the table ("Spent" / "Left") changes which one shows,
  like Monarch's mobile view. The choice is remembered per browser
  (localStorage, wrapped in try/catch). No horizontal page scroll at 320px.
- Status text and "Over by" are real text, not colour alone. Contrast meets AA
  in both themes. Focus order stays predictable, and the table adds no
  interactive cells in this stage.

## States to cover

Current, past (read-only) and future (provisional, no recorded activity) periods;
complete, partial and no account history; stale or previously loaded figures;
unavailable details; a funding gap now and in future; a paused budget; archived
lines; category limits on and off; no bills; no goals; one-off cash present and
absent; 1 to 100 lines; long names (60 characters).

## Verification

Follow [[SYSTEM_INTEGRITY]]. Nothing runs against the personal local database.

1. Unit (vitest): adapter exposure of `sheet` with unavailable, stale and
   provisional cases; `budgetSheet.ts` row mapping and ratios, including a funding
   gap and an unavailable group; `BudgetSheet` static-markup tests in the style of
   `BudgetUnplanned.test.tsx`.
2. SQL: migration lifecycle and contract proofs on an isolated candidate
   (`npm run test:budget:release`, or the BUI-style disposable project). Group
   totals must equal the sum of their rows, nulls must propagate, and the
   privilege assertions must hold.
3. Browser: extend `test-budget-plan.mjs` on the isolated candidate at 320, 390,
   768, 1024 and 1440px in both themes, with axe scans. Assert that every saved
   line appears once, the group totals and bottom rows match, the phone column
   switch works, opening the view makes no writes, and the funding-gap display is
   correct.
4. Full regression: `tsc`, all unit tests, a production build, and the existing
   Budget lifecycle regression on a fresh disposable project with exact fixture
   cleanup.
5. Applying the migration to the personal stack is a separate owner decision,
   made only after a recorded backup and the preflight in [[SYSTEM_INTEGRITY]].

## Docs to update when it ships

- `INDEX.md`: the new migration and function, `BudgetSheet.tsx`, `budgetSheet.ts`.
- `CLAUDE.md`: add the one-line Recent changes entry, capped at 10 entries.
- A checkpoint note in `docs/budget/` with run evidence and captures under
  `docs/budget-ui/`.

## Owner decisions (12 November 2026)

1. **Tab name:** stays "My plan". The tab's job doesn't change.
2. **Goals and set-asides:** two separate groups. Goals have targets and dates;
   set-asides are simpler reserves.
3. **Overview:** its bills and goals sections stay as they are for now. Revisit
   slimming them once the table ships.

Edited auto-build suggestions will be labelled **row by row** when stage 3 brings
the table into setup. That stage owns that change, not this one.

## Order of work

1. Migration and `budget_sheet_facts`, with SQL proofs on an isolated project.
2. Types and adapter exposure, with unit tests.
3. `budgetSheet.ts`, with unit tests.
4. `BudgetSheet.tsx` and CSS for desktop, then the phone column switch.
5. Browser harness, accessibility scans and captures.
6. Docs and the checkpoint note.
