# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Halcyon is a personal finance app for its creator and potentially close friends and family. People use it to understand and manage their own finances across multiple accounts.

## Product Purpose

Bring a person's financial information together in one understandable, secure place. Help them track their money, understand their financial position, and prepare and manage budgets without making everyday use feel complicated.

## Positioning

Halcyon aims to bring finances from different accounts into one place, addressing a need the owner finds poorly served in Australia. It combines consolidated financial tracking with AI-assisted transaction categorisation and budget preparation. Availability and coverage of individual integrations and assistance features must be checked against the current implementation; do not imply every Australian provider is supported or that all budget assistance uses AI.

## Operating Context

Users work with sensitive personal financial information, including accounts, transactions, balances and budgets. Data can come from manual entry, CSV imports and supported provider connections. The application uses Supabase authentication, tenant-scoped data and server-side functions. The local Supabase environment may contain real financial history and must be treated as valuable data, not a disposable test database; follow `SYSTEM_INTEGRITY.md` before database operations.

## Capabilities and Constraints

- The product includes consolidated account and net-worth views, transactions, income and expense analysis, and budgeting workflows. Consult `CURRENT_STATUS.md` for current implementation and release status.
- AI can assist categorisation; budgeting assistance exists, but its specific methods and current capabilities should be verified before making claims.
- Preserve authentication, row-level security, server-side validation and the project's financial data integrity safeguards.
- The intended experience should be easy to understand and use, including when presenting complex financial information.
- Use the existing Halcyon design system and implementation as the authority for established UI decisions: `Halcyon_DesignSystem.md` and `app/src/index.css`.

## Brand Commitments

The product is called Halcyon. Its owner wants an interesting, creative and premium identity with an Xbox/Halo-inspired feel that reflects their interest in gaming, while avoiding a generic finance-app character. Preserve the existing Halcyon identity and design system when refining existing interfaces.

## Evidence on Hand

The working application and product documentation live in `app/`, `README.md`, `CURRENT_STATUS.md`, `MVP_SCOPE.md`, and `System requirements - SRD.md`. `CURRENT_STATUS.md` records implementation and verification evidence; historical plans may describe capabilities that are deferred or have since changed. Do not invent customer testimonials, provider coverage, or performance and security claims.

## Product Principles

1. Make a multi-account financial position understandable in one place.
2. Protect personal financial data and preserve financial correctness.
3. Make everyday workflows approachable, with useful detail when needed.
4. Use automation and assistance to support the user's understanding and control.
5. Keep Halcyon's creative, premium gaming-inspired identity coherent with its practical purpose.
