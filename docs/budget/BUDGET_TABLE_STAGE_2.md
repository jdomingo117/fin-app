---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-11-12
updated: 2026-11-12
related:
  - "[[BUDGET_TABLE_STAGE_1]]"
  - "[[BUDGET_TABLE_STAGE_1_PLAN]]"
---

# Budget table — stage 2: explaining the figures

Stage 2 helps the My plan table explain itself. It adds no reads, migrations or
commands, and it does no money arithmetic.

## What shipped

- **Formula bar** (`#budget-sheet-fx`): every row name, group total and summary row
  is now a toggle button. Choosing one shows its working in a polite live region
  above the table.
  - Everyday pool: "Left = planned (+ carried over) (+ moved in) − spent". This is the
    same identity as the hero's "How it works", using server figures. Carry and moved
    amounts appear only when they're non-zero or unknown.
  - Category rows: their parts, without an equation, because category balances can
    include moves between categories.
  - Bills: planned, matched payments and left, with "A payment that isn't matched yet
    doesn't mean it's unpaid."
  - Set-asides and goals: the amount so far (of the target) and the amount planned
    this budget, with a note that this is a plan rather than money moved.
  - Transfers: planned amount and matched bank transfers.
  - Summary rows: "Still to plan (or Funding gap) = expected income (+ existing cash)
    − total planned".
  - Any qualification adds "About these figures: …" in the existing wording.
- **Corner marks**: a known figure that carries a qualification (partial history, no
  activity, provisional and so on) gets a small corner mark. A key below the table
  explains it.
- **Even-pace tick**: in a current monthly or fortnightly period, everyday rows that
  have a spending bar show a tick for the day of the period, from `remainingDays`.
  The formula bar names the day ("Today is day 12 of 30").

## Verification

- The final isolated My plan run on a disposable candidate project passed **132 checks**, and its exact fixture cleanup passed. 669 unit tests, TypeScript and the production build pass.

- Unit tests cover the explanation wording (exact identity, category parts, bills,
  goals, transfers and qualifications) and the component (hint, toggle wiring, corner
  mark and key, and a pace tick only in current periods). The full suite passed.
- Browser checks were added to `test-budget-plan.mjs`:
  - choosing a row explains it, a second click toggles it off, and Enter works from
    the keyboard;
  - the summary equation is correct, including a negative funding gap;
  - qualified figures carry corner marks;
  - with no recorded spending there is no bar, so no tick is drawn.
- Checked in the owner's app with real data: the everyday working, the
  "Known activity only" reason, day 12 of 30, and corner marks on figures with
  partial history.
