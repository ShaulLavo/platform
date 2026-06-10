# Workspace Content Engine Evaluation Plan

Status: draft

This plan covers evaluating indexed content-search engines for workspace search. It is intentionally separate from the workspace search foundation plan. The foundation plan keeps ripgrep as the content engine; this plan asks whether ripgrep should later be augmented or replaced for persisted workspace content search.

## Candidates

Primary candidates:

- `rg`: current baseline and correctness oracle.
- `erogol/ngi`: trigram-indexed regex search that prefilters candidate files and delegates exact matching to ripgrep when useful.
- `PythonicNinja/trigrep`: disk-backed trigram / sparse n-gram indexed regex search.
- `sourcegraph/zoekt`: mature trigram-based code search engine with query language, service mode, ranking, and local directory/repo indexing.

Candidate URLs:

- https://github.com/erogol/ngi
- https://github.com/PythonicNinja/trigrep
- https://github.com/sourcegraph/zoekt

## Scope

In scope:

- Persisted workspace content search.
- Literal and regex content queries.
- Include and exclude path filters.
- Case sensitivity.
- Whole-word matching if supported or emulatable.
- Streaming or first-result latency where possible.
- Index build, update, and invalidation cost.
- Correctness parity against ripgrep.

Out of scope:

- Current-file editor find.
- Dirty open-buffer search.
- Whole-filesystem search.
- Workspace quick-open path search.
- AST search and semantic search.
- Replace-in-files execution. Replacement should continue to validate against current file contents independently.

## Principle

Ripgrep remains the fallback and oracle until another engine proves all required behavior.

An indexed engine can accelerate candidate selection, but exact matches must still be verified. False positives are acceptable if final results are exact. False negatives are not acceptable.

## Content Search Engine Interface

Add an internal interface before integrating any engine deeply.

Required behavior:

- Accept `WorkspaceSearchQuery`.
- Accept workspace root and path scope.
- Accept cancellation.
- Emit normalized `WorkspaceSearchEvent` values.
- Report provider metadata and timings.
- Report whether the result was indexed, fallback, full scan, or partial.
- Return warnings for unsupported query features instead of silently changing behavior.

Expected implementations:

- `RgContentSearchEngine`.
- `NgiContentSearchEngine`.
- `TrigrepContentSearchEngine`.
- `ZoektContentSearchEngine`.

The engine interface should sit below the current disk provider. Open-buffer overlay should remain outside it.

## Benchmark Matrix

Benchmark each engine on the same workspace roots.

Workspaces:

- This repository.
- A medium TypeScript/React repository.
- A large monorepo if available locally.
- A synthetic fixture with many files and controlled match distribution.

Query classes:

- Selective literal: one rare symbol.
- Common literal: `function`, `const`, `import`.
- Short literal: one or two characters.
- Regex with required literals: `import.*from.*react`.
- Alternation: `TODO|FIXME|HACK|XXX`.
- Anchored regex: `^\\s*export\\s`.
- Whole word query.
- Case-insensitive query.
- Include glob query.
- Exclude glob query.
- Query with zero matches.
- Query that matches binary-looking or very large files.

Metrics:

- Cold index build time.
- Incremental update time after editing one file.
- Incremental update time after editing many files.
- Index disk size.
- Peak memory during indexing.
- Warm query total latency.
- First-result latency.
- Result count parity with ripgrep.
- File count parity with ripgrep.
- Output normalization cost.
- Cancellation latency.
- Behavior when index is missing, stale, or corrupt.

## Correctness Harness

Use ripgrep as the reference.

For each query:

- Run `rg` with the current app semantics.
- Run each candidate engine.
- Normalize path separators, line numbers, column numbers, and line text.
- Compare file paths and match ranges when available.
- Categorize mismatches as unsupported feature, false positive after verification, false negative, or output-shape mismatch.

The harness should record:

- Engine command.
- Query options.
- Workspace root.
- Index state.
- Raw summary output.
- Normalized mismatch report.

False negative reports should block promotion.

## Candidate Notes

### `ngi`

Strengths:

- Small Rust CLI.
- Designed around trigram prefilter plus ripgrep exact matching.
- JSONL output.
- Auto-builds and incrementally updates an index.
- Falls back to full ripgrep scan when the candidate set is too broad.

Concerns:

- Very young project.
- No release history at the time of review.
- Index location defaults to `.ngi/` in the project root.
- Need to verify cancellation, path filters, ignore semantics, and JSON stability.
- Need to verify behavior on non-git workspaces.

Best use:

- Fast spike to answer whether a lightweight indexed-ripgrep wrapper is materially better for our workloads.

### `trigrep`

Strengths:

- Rust implementation.
- Disk-backed trigram index.
- Explicitly targets large codebase and agent search workloads.
- Has separate CLI and index crates.

Concerns:

- Young project.
- Need to verify output format, query feature coverage, incremental updates, and ignore semantics.
- Need to decide whether it offers enough over `ngi` to justify maintaining both integrations.

Best use:

- Compare against `ngi` as another lightweight local indexed grep design.

### Zoekt

Strengths:

- Mature code search engine.
- Supports substring and regexp matching.
- Rich query language with boolean operators.
- Local directory and git repo indexing.
- Service mode exists.
- Ranking can use code-oriented signals and symbols.

Concerns:

- Larger integration surface.
- Go-based service/tooling in an otherwise Bun/TypeScript server path.
- Index size can be significant.
- Query semantics differ from ripgrep.
- Need to decide how local unsaved changes and near-real-time updates should be handled.
- Need to verify whether command mode or service mode is the right integration.

Best use:

- Serious long-term content-search backend candidate if lightweight engines are not enough.

## Integration Experiments

### Experiment 1: External CLI Adapters

Run each candidate as a child process.

Goals:

- Prove query coverage.
- Measure command startup overhead.
- Measure output parsing cost.
- Avoid deep integration until the candidate is validated.

Acceptance:

- Engine can be installed locally.
- Engine can index a workspace.
- Engine can return normalized matches.
- Engine can be cancelled.
- Engine can fall back to `rg` or report unsupported features.

### Experiment 2: Index Lifecycle

Exercise index build and update behavior.

Scenarios:

- First search with no index.
- Explicit rebuild.
- File edit.
- File create.
- File delete.
- File rename.
- Branch checkout or mass file churn.
- Index corruption or missing index files.

Acceptance:

- Search remains correct.
- Failure mode is fallback, rebuild, or clear warning.
- The app never returns stale false-negative results silently.

### Experiment 3: Service Mode For Zoekt

Evaluate whether Zoekt should run as a long-lived service.

Questions:

- Can we maintain one index per workspace?
- Can we choose index storage outside the repo root?
- Can we stream or page results?
- Can we update incrementally enough for active development?
- Can we shut down cleanly when a workspace closes?

Acceptance:

- Service lifecycle is predictable.
- Index storage is app-owned.
- Search requests are cancellable or bounded.
- Query results can be normalized into existing `WorkspaceSearchEvent` values.

## Promotion Criteria

A candidate can become an optional provider when:

- It has no false negatives against the benchmark harness for supported query classes.
- Unsupported query classes reliably fall back to `rg`.
- Warm query latency is materially better than `rg` for selective and medium-selective searches.
- Broad queries are not materially worse than `rg`.
- Index build and update cost is acceptable.
- Disk usage is acceptable for normal workspaces.
- The engine can be disabled with one config flag.
- The app can recover from missing, stale, or corrupt indexes.

A candidate can replace ripgrep as default only after:

- It has been optional for a while.
- It has telemetry showing reliable wins.
- It handles cancellation and stale indexes safely.
- It has clear operational behavior across workspace open, close, rename, and branch changes.

## Deliverables

- Benchmark harness.
- Normalized result comparator against ripgrep.
- Engine adapter spike for `ngi`.
- Engine adapter spike for `trigrep`.
- Engine adapter spike for Zoekt command mode.
- Zoekt service-mode notes.
- Summary table with recommendation.

## Recommended Order

1. Build the engine interface using `rg`.
2. Add the correctness harness.
3. Spike `ngi`.
4. Spike `trigrep`.
5. Spike Zoekt command mode.
6. Evaluate Zoekt service mode only if command mode results justify deeper work.

## References

- Current server search: `apps/server/src/fs/search.ts`
- Current search tool runner: `apps/server/src/fs/search-tool-runner.ts`
- `ngi`: https://github.com/erogol/ngi
- `trigrep`: https://github.com/PythonicNinja/trigrep
- Zoekt: https://github.com/sourcegraph/zoekt
- Zoekt design: https://github.com/sourcegraph/zoekt/blob/main/doc/design.md
