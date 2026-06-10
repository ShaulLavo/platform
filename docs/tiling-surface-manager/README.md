# Tiling Surface Manager Docs

Where the truth lives:

- **Code** — the implementation is the source of truth for mechanics.
  - Engine: `apps/web/src/features/tiling-surface-manager/engine/`
  - Workbench rendering/interaction: `apps/web/src/features/workbench/`
  - Drag/snap interaction direction: `apps/web/src/features/dnd-proof/`
  - App-shell cutover proof: `apps/web/src/features/shell-proof/`
- [behavior-contracts.md](behavior-contracts.md) — durable invariants that
  must stay true across refactors.
- [backlog.md](backlog.md) — open work, proof gaps, open questions, deferred
  scope.
- [default-recipe.md](default-recipe.md) — canonical default placement spec.
- [prd.md](prd.md) — product requirements.
- [shell-proof-plan.md](shell-proof-plan.md) — implemented execution plan for
  the full app-shell proof page that closes the dnd-proof cutover gaps.
- Follow-up plans: [future-layout-plan.md](future-layout-plan.md),
  [placement-policy-follow-up-plan.md](placement-policy-follow-up-plan.md),
  [agent-surfaces-follow-up-plan.md](agent-surfaces-follow-up-plan.md).

Deleted on 2026-06-10 because all V1 phases completed and their
implementation detail had drifted from the code (recover from git history if
needed): `implementation-plan.md`, `technical-design.md`,
`research-findings.md`.
