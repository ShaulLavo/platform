# Plan 067: Integrate the reviewed Ghostty appearance artifact into Platform

> **Executor instructions**: Read this plan completely, then read Platform `AGENTS.md`, root
> `PLAN.md`, Plan 066, the stable `ghostty-webgpu/docs/config-resolver-feasibility.md` and
> `ghostty-webgpu/docs/config-resolver-feasibility.json` evidence, and
> `/Users/shaul/.agents/skills/never-nester/SKILL.md`. Execute every gate in order.
>
> This plan consumes the exact reviewed, unpublished `ghostty-webgpu@0.1.2` tarball from Plan 066.
> Integrate and verify those bytes before asking an operator to publish them. Do not commit, push,
> create a branch, publish, or open a PR without explicit operator approval.

## Status

- **State**: Blocked on Plan 066's reviewed release candidate, root scheduling, and dirty-file
  reconciliation
- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH — host-file privacy, native deployment, first-paint appearance, and terminal
  lifecycle meet at one boundary
- **Platform baseline**: `1fc53a8cb7113767cf6e88024c366a01fb919bca`
- **Package requirement**: exact unpublished `ghostty-webgpu@0.1.2` artifact from Plan 066
- **Upstream requirement**: `c8554f28e0efe2f5595f32020371c34b25ec628f`

Root `PLAN.md` is authoritative. Stop and ask the operator where to schedule this independent
terminal lane if it has not been added there when execution is requested.

## Required handoff from Plan 066

Before touching Platform source, require these exact local files:

- `/Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.tgz`
- `/Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.identity.json`
- `/Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.evidence.json`

Before touching Platform, run the package's maintained read-only verifier:

```bash
cd /Users/shaul/Desktop/D/ghostty-webgpu
bun scripts/create-release-candidate.ts --verify \
  --tarball .artifacts/ghostty-webgpu-0.1.2.tgz \
  --identity .artifacts/ghostty-webgpu-0.1.2.identity.json \
  --evidence .artifacts/ghostty-webgpu-0.1.2.evidence.json
```

It must verify the tarball's SHA-256, npm SHA-512 integrity, npm shasum, byte length, package
version, native-manifest hash, package/native source identities and input tree, original assembly,
release rebuild, four exact-tarball smoke records, and upstream pin. Stop on any mismatch; never
repack or rewrite any handoff file.

The artifact must already provide:

- the host-only `ghostty-webgpu/config-resolver` export with no caller-supplied path/env/argv;
- browser-safe root exports containing `Terminal` and no native/Node graph;
- additive `Terminal.setAppearance(...)`;
- optional public `cursorText` with private canonical fallback; and
- the exact bounded appearance contract repeated below.

Do not install those bytes yet. First reconcile Gate 0 and capture its complete named baseline. The
explicit post-baseline transient-package gate below defines the only permitted install, verification,
journaled activation, and restoration procedure. Do not substitute the sibling source checkout; every
pre-publication gate must exercise the reviewed package contents.

## Required outcome

1. One authenticated parameterless `GET /terminal/theme` returns only a strict visual whitelist.
2. The loopback server reads host config lazily through the package resolver. `createApp` is disabled
   by default; only production `index.ts` injects the native resolver.
3. A persisted `workbench` opt-out and a settings-load failure perform zero theme-route and resolver
   calls, including during cold start.
4. Platform selects `profiles.dark` or `profiles.light` using its own `resolvedTheme`; the backend
   never guesses the browser theme from the host OS.
5. Initial theme and CSS surface are present before `terminal.open()`. Later setting, query, or
   resolved-theme changes update the existing terminal atomically without remounting, reconnecting
   its socket, clearing scrollback, or losing focus.
6. A settings failure always uses today's workbench palette and performs no request. Missing config,
   unsupported host, invalid output, timeout, or request failure uses workbench when no
   last-known-good Ghostty appearance exists. After one validated success, a transient resolver or
   refetch failure may retain only that sanitized appearance as the explicitly marked stale state
   until the hard five-minute deadline measured from that success; failures never extend it.
7. Default cells remain transparent and explicit cell backgrounds remain opaque. Host background
   opacity is accurate for the default `background-opacity-cells = false`; blur, glass, P3, dynamic
   cell references, and opacity-cells deviations stay explicitly best-effort.
8. The built server resolves the external host-only subpath and packaged assets from `node_modules`;
   the web bundle contains none of them.
9. Only after automated, built-runtime, and real visual acceptance pass does an operator publish the
   exact tarball. Platform then pins registry `0.1.2` and repeats every gate.

## Non-goals and ownership boundaries

- No TypeScript Ghostty parser and no installed `ghostty +show-config`.
- No browser-supplied config path, executable, argv, environment, theme name, or raw config.
- No Ghostty font, cursor-shape/blink, keybinding, shell, environment, background-image, or PTY
  behavior in v1; existing Platform settings/services continue to own those.
- No config editor, file watcher, Windows resolver, exact macOS glass, exact Display-P3, or exact
  per-cell dynamic cursor/selection color.
- No remote/multi-tenant config read. Platform production already refuses a non-loopback host; keep
  that invariant.
- `ghostty-webgpu` owns Ghostty semantics/artifacts. Platform server owns invocation policy, cache,
  auth, and fallback. Contracts own the wire. Platform web owns light/dark choice and CSS surface.

## Exact wire contract

Create recursively strict Valibot schemas in `packages/contracts/src/terminal-theme.ts`; use
`v.strictObject` at every object depth. Do not use permissive `v.object`.

The success appearance is exactly the Plan 066 package shape:

- `schemaVersion`: literal `1`;
- `upstreamRevision`: literal `c8554f28e0efe2f5595f32020371c34b25ec628f`;
- `revision`: exactly 64 lowercase hexadecimal characters;
- `diagnosticCount`: integer `0..65_535`;
- strict `profiles.light` and `profiles.dark`, each with:
  - strict `theme` containing `background`, `foreground`, `cursor`, `cursorText`,
    `selectionBackground`, `selectionForeground`, `minimumContrast`, and `palette`;
  - strict `surface` containing `backgroundOpacity`, `backgroundBlurRadius`, and
    `backgroundOpacityCells`;
  - `fidelity: 'exact' | 'best-effort'`;
  - a unique bounded `degradedFeatures` array.

Every RGB object contains exactly integer `r`, `g`, and `b` in `0..255`. Palette length is exactly 256. Minimum contrast is finite `1..21`; opacity is finite `0..1`; blur radius is integer `0..255`.
The degradation array has at most eight unique members from exactly:

- `background-blur`
- `background-opacity-cells`
- `cursor-color-cell-reference`
- `cursor-text-cell-reference`
- `selection-background-cell-reference`
- `selection-foreground-cell-reference`
- `display-p3`
- `macos-glass`

`exact` requires an empty degradation list; `best-effort` requires at least one item. Present members
in the fixed enum order printed above. Recompute and verify `revision` using Plan 066's
lexicographically sorted-key canonical JSON algorithm, excluding the revision field itself.

The route response is exactly:

```ts
type TerminalThemeResponse =
  | {
      readonly status: 'ready'
      readonly appearance: GhosttyConfigAppearance
    }
  | {
      readonly status: 'stale'
      readonly appearance: GhosttyConfigAppearance
      readonly staleForMs: number
    }
  | {
      readonly status: 'unavailable'
      readonly reason:
        | 'config-not-found'
        | 'disabled'
        | 'invalid-output'
        | 'output-limit'
        | 'resolver-failed'
        | 'timeout'
        | 'unsupported-platform'
    }
```

`staleForMs` is a finite integer `1..300_000` and is present only for `stale`. It is the remaining
hard lifetime of the last-known-good result at response serialization, never a fresh TTL granted by
the failure. A browser must bind that duration to the shared request that received it; reading the
same cached response again must not create a new deadline.

Unknown top-level/nested keys, non-finite/fractional/out-of-range numbers, palette lengths 255/257,
duplicate/unknown degradations, inconsistent fidelity, uppercase/wrong-length hashes, arbitrary
diagnostic strings, and the wrong upstream revision must all fail validation.

## Expected Platform scope

Reconcile live paths before editing; expected scope is:

- `packages/contracts/src/terminal-theme.ts`
- `packages/contracts/src/tests/terminal-theme.test.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/settings/keys.ts`
- `packages/contracts/src/settings/schema.json`
- settings registry/schema tests
- `apps/server/src/terminal/theme-service.ts`
- `apps/server/src/terminal/theme-routes.ts`
- `apps/server/src/terminal/tests/theme-service.test.ts`
- `apps/server/src/terminal/tests/theme-routes.test.ts`
- `apps/server/src/app.ts`, `apps/server/src/index.ts`, and `apps/server/src/tests/app.test.ts`
- `apps/server/package.json`
- `apps/web/test/server.ts`
- `apps/web/src/features/terminal/components/panel.tsx`
- terminal link hook, command utilities, and every exact-class test/user found by inventory
- new terminal theme query, projection, readiness, surface, and host-runtime helpers/tests
- `apps/web/package.json`
- `packages/ui/src/styles/globals.css`
- `scripts/terminal-theme-package-state.ts`, `scripts/terminal-theme-production-smoke.ts`, and their
  focused tests
- root `package.json` only to enumerate those maintained script tests
- `docs/settings-reference.md`
- root `bun.lock`

Do not use this list to omit a live exact-class import or necessary existing test harness. Update the
plan before expanding into a materially different subsystem.

## Gate 0 — reconcile drift and dirty ownership

Run:

```bash
cd /Users/shaul/Desktop/D/platform
git rev-parse HEAD
git status --short
git diff --stat 1fc53a8cb7113767cf6e88024c366a01fb919bca..HEAD -- \
  apps/server apps/web/src/features/terminal apps/web/test packages/contracts \
  packages/ui/src/styles/globals.css scripts package.json bun.lock docs/settings-reference.md
rg -n '\bGhosttyWebGpuTerminal\b' apps/web/src/features/terminal apps/web/test
```

At planning time Platform had a large unrelated user-owned WorkspaceEdit/LSP transaction. Three
eventual overlaps were already dirty:

- `packages/contracts/src/index.ts`
- `apps/server/src/tests/app.test.ts`
- `apps/web/test/server.ts`

The live `apps/web/test/server.ts` already imports `AppOptions` and its `TestServerOptions` carries
the WorkspaceEdit clock/driver and journal root. Milestone 3 must add `terminalTheme` to that current
shape and preserve those fields/defaults; it must not restore the baseline harness. Adjacent
`apps/server/src/testing.ts` and `apps/server/test/server.ts` were also dirty for the same
WorkspaceEdit work even though this plan does not presently need to edit them. Treat any newly
necessary change there as an overlap requiring reconciliation first.

Do not overwrite, stash, revert, reformat, or silently combine those changes. Wait for the owner to
land them or obtain explicit reconciliation instructions. Re-audit later drift in `app.ts`, test
harnesses, contracts, terminal files, settings, manifests, and build scripts.

Capture focused test/type/build baselines only after overlap is resolved. Rerun any pre-existing
failure once and record its exact name. Completion permits no new failures relative to that record.

Use this named baseline matrix; do not replace it with bare root `bun run verify`:

```bash
cd /Users/shaul/Desktop/D/platform
bun run test:scripts
bun run --filter @workspace/contracts test
bun run --filter @workspace/ui test
bun run --filter server test
bun run --filter web test
bun run --filter @workspace/contracts typecheck
bun run --filter @workspace/ui typecheck
bun run --filter server typecheck
bun run --filter web typecheck
bun run --filter @workspace/contracts lint
bun run --filter @workspace/ui lint
bun run --filter server lint
bun run --filter web lint
bun run --filter @workspace/contracts format:check
bun run --filter @workspace/ui format:check
bun run --filter server format:check
bun run --filter web format:check
bun run build
```

Record duration and exact failing test/check names per command. Later gates compare each command to
its own baseline; an unrelated pre-existing failure is not license for a new one.

### Post-baseline transient-package gate

As the first planned source edit, add `scripts/terminal-theme-package-state.ts` and its focused test,
extend root `test:scripts` to enumerate it, and run that focused test successfully before trusting
the tool. It supports only `--prepare`, `--activate`, `--assert-transient`, `--restore`,
`--assert-restored`, and `--clear`. All mutable state lives beneath the exclusive, same-filesystem
directory `$(git rev-parse --git-path terminal-theme-package-state)`; refuse `--prepare` if it already
exists. Every phase is a canonical sorted-key write-ahead journal written to a temporary file,
fsynced, and atomically renamed before its corresponding filesystem mutation.

`--prepare` accepts explicit absolute `--tarball`, `--identity`, and `--evidence` paths. Before any
dependency mutation, it invokes Plan 066's strict read-only verifier, binds all three file
identities, and records the exact SHA-256 of `bun.lock`; the canonical SHA-256 of the `dependencies`,
`devDependencies`, `optionalDependencies`, and `peerDependencies` objects (missing means `{}`) from
both consumer manifests; and this state for `apps/web` and `apps/server`:

- the real package-root/package.json path, package version, and entry realpath reached by Bun for
  `ghostty-webgpu` and `ghostty-webgpu/config-resolver`, using the consumer directory as resolution
  base; an unresolved entry is an explicit `null`;
- every unique real package root reachable through those entries or an ancestor
  `node_modules/ghostty-webgpu` candidate between the consumer and workspace root; and
- the exact `lstat` kind and, for a symlink, raw link target of each such resolver candidate before
  activation; require every candidate node to be absent or a symlink and reject a materialized
  directory before mutation;
- for each root, the SHA-256 of the Plan 066 canonical packed-file-list object: regular files only,
  sorted by unsigned UTF-8 relative-path bytes, with strict `{path, mode, bytes, sha256}` records,
  normalized POSIX paths, modes `0644|0755`, and no symlink/device/special entries.

The tool fails if an entry escapes its reported package root, a candidate is ambiguous, two visible
roots can satisfy the same consumer/subpath, or an installed file set is unbounded or malformed.
Freeze focused fixtures for hoisted and consumer-local packages, a missing host subpath, duplicate
versions, symlinked package roots, one-byte/mode/path drift, and exact baseline-link restoration.
This is the reproducible meaning of “currently resolved package”; do not replace it with a cache
directory scan or an ad hoc hash.

Still inside `--prepare`, create a minimal consumer beneath the task-state directory and invoke
absolute Bun with mandatory `--ignore-scripts` and `--no-env-file`, fixed argv, cwd in that consumer,
a task-local install cache, and a fresh environment containing only task-local `HOME`, `TMPDIR`, and
`XDG_CACHE_HOME`. Before invoking Bun, read the package manifest directly from the verified tarball
and reject `preinstall`, `install`, `postinstall`, or `prepare`; require the generated consumer to
have no lifecycle scripts either. After installation, enumerate every installed package manifest,
record any lifecycle keys, and prove from the captured argv that scripts remained disabled for the
whole dependency graph. No package-manager command may run against Platform's live workspace or
inherit registry credentials. A failed or partial scripts-disabled install therefore changes only
the exclusive task directory. Verify the staged package is `0.1.2`, its canonical complete file-list
hash equals the identity, both package subpaths resolve as intended, and its manifest/native assets
match the reviewed handoff. Only then journal phase `prepared`.

`--activate` creates consumer-local links at exactly
`apps/web/node_modules/ghostty-webgpu` and `apps/server/node_modules/ghostty-webgpu`. Implement and
fixture-test one atomic `renameNoReplace` primitive: Linux uses `renameat2(..., RENAME_NOREPLACE)` and
macOS uses `renameatx_np(..., RENAME_EXCL)` (or an equivalent proven no-replace syscall). Fail closed
on an unsupported kernel/filesystem or any result whose no-clobber semantics cannot be proven; an
ordinary POSIX rename is forbidden.

Before each operation, journal the candidate, baseline absence/raw symlink target, task-stage
target, quarantine destination, and next phase. Require each `node_modules` parent to be an existing
real directory beneath its consumer, and revalidate the parent plus all
lock/dependency/candidate baseline identities immediately before mutation. Move an existing
baseline symlink to its exclusive quarantine path with `renameNoReplace`, then verify the moved node
still has the journaled kind and raw target. On mismatch, attempt only a no-replace move back and fail
closed. Create the task-stage symlink directly at the final consumer path with the exclusive
`symlink()` operation; `EEXIST` is a concurrent-drift failure, never permission to replace the node.
Never move, unlink, or replace a directory, regular file, package-store entry, or unrecorded path.
The write-ahead phases must make restoration deterministic after interruption before, between, or
after either consumer activation without a destination-clobber window.

```bash
cd /Users/shaul/Desktop/D/platform
bun --bun vitest run scripts/terminal-theme-package-state.test.ts --environment node
```

Before editing any theme source, run a complete prepare→activate→restore rehearsal:

```bash
cd /Users/shaul/Desktop/D/platform
bun scripts/terminal-theme-package-state.ts --prepare \
  --tarball /Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.tgz \
  --identity /Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.identity.json \
  --evidence /Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.evidence.json
bun scripts/terminal-theme-package-state.ts --activate
bun scripts/terminal-theme-package-state.ts --assert-transient \
  --identity /Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.identity.json
bun scripts/terminal-theme-package-state.ts --restore
bun scripts/terminal-theme-package-state.ts --assert-restored
bun scripts/terminal-theme-package-state.ts --clear
```

`--assert-transient` requires both consumers to resolve the browser-safe root from version `0.1.2`,
the server to resolve the host-only subpath from that same real package root, and every transient
root's canonical file-list hash to equal the identity's `packedFileListSha256`. It also requires the
lock hash and all eight dependency sections to equal the prepared baseline and rejects any persisted
`file:`, `link:`, absolute, or tarball dependency. Stop if exact staged activation cannot satisfy
this.

`--restore` replays the write-ahead journal in reverse. Move the live candidate with
`renameNoReplace` to a fresh journaled quarantine path before inspecting it; if its kind/raw target
is not the recorded task-stage symlink, attempt only a no-replace move back and fail closed. Restore
an exact quarantined baseline symlink with `renameNoReplace`, or preserve baseline absence. Delete a
task symlink only after it is isolated in quarantine and revalidated. A concurrent node at any final
destination causes a recoverable fail-closed result, never an overwrite or unlink. Restoration never
runs a package manager against the live workspace and never depends on a successful assertion or
completed activation record: the pre-mutation journal is sufficient after any
prepare/activate/assert interruption. `--assert-restored` requires the original lock/dependency
hashes and exact consumer resolution roots, versions, entry paths, and file-list hashes, and rejects
any resolver-visible transient `0.1.2`. `--clear` runs only after that assertion and removes only the
journaled task stage and quarantine after rechecking their identities.

Tests inject failure after every journal write, staged-install step, no-replace move, direct link
creation, activation, assertion, and restoration boundary. Add adversarial mutations immediately
after revalidation and before each filesystem operation; prove no foreign destination is overwritten
or unlinked and `--restore --assert-restored` either succeeds or leaves the exact quarantined node
for explicit recovery. Continue only after that rehearsal proves exact restoration. Then repeat
`--prepare`, `--activate`, and `--assert-transient` to arm the active pre-publication integration
state.

```bash
cd /Users/shaul/Desktop/D/platform
bun scripts/terminal-theme-package-state.ts --prepare \
  --tarball /Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.tgz \
  --identity /Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.identity.json \
  --evidence /Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.evidence.json
bun scripts/terminal-theme-package-state.ts --activate
bun scripts/terminal-theme-package-state.ts --assert-transient \
  --identity /Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.identity.json
```

Treat the install as a scoped resource. Before every planned failure report, STOP, approval pause,
or successful pre-publication handoff, restore and prove the baseline state:

```bash
cd /Users/shaul/Desktop/D/platform
bun scripts/terminal-theme-package-state.ts --restore
bun scripts/terminal-theme-package-state.ts --assert-restored
bun scripts/terminal-theme-package-state.ts --clear
```

Never delete a `node_modules` entry manually or broaden the state tool beyond the journaled symlink
protocol. Run implementation and gates under a `try/finally` (or equivalent shell trap) that invokes
restoration; after an uncatchable interruption, the first resume action must detect the surviving
journal and restore before doing anything else. If restoration fails, preserve the task state and
report that cleanup failure first. After successful restoration at the publication pause, the staged
source intentionally cannot run against the old package; do not resume execution until the operator
chooses publication or abort disposition.

## Milestone 1 — strict contract and machine-scoped source setting

Implement and export the exact schemas, parse helpers, constants, canonical revision verifier, and
readonly inferred types. Contracts must not import `ghostty-webgpu`.

Register:

```text
terminal.integrated.themeSource
```

with values `auto | workbench`, default `auto`, scope `machine`, widget `enum`, category `Terminal`,
and a description stating that `auto` uses local Ghostty appearance when available and otherwise
falls back to Platform colors. Machine scope is deliberate: a cloned workspace must never activate
a host-file read.

Run `bun run settings:schema` and `bun run settings:reference`; include their generated outputs.
Add registry/schema tests for the default, enum, machine-only write target, and rejection from a
workspace layer. Do not add a config path, executable, environment override, localStorage key, or
workspace setting.

## Milestone 2 — lazy server service and authenticated route

Define a local structural `TerminalThemeResolver` in Platform; `app.ts` must not import the package
runtime. Add a separate optional `AppOptions.terminalTheme` object with an injected resolver and
test clock/deadline seam. Do not pass theme options into the existing PTY `TerminalService`.

`createApp` always installs the route/service but defaults to no resolver, which returns
`{ status: 'unavailable', reason: 'disabled' }` without touching the filesystem. Only loopback
production `apps/server/src/index.ts` imports
`resolveGhosttyConfigAppearance` from `ghostty-webgpu/config-resolver` and injects it. The resolver
takes no arguments and derives Ghostty's official search inputs from the package wrapper's fixed
environment allowlist.

Service behavior is fixed:

- lazy: construction/startup performs no resolution;
- one in-flight promise for all concurrent callers;
- validate and recompute the revision before caching;
- ready TTL `30_000 ms`;
- unavailable TTL `300_000 ms`;
- one in-memory last-known-good appearance plus its successful-resolution timestamp;
- a hard stale maximum of `300_000 ms` from that successful resolution: before its deadline a
  failure returns/caches `stale` only until the lesser of the negative-cache deadline and that fixed
  deadline, with the remaining duration in `staleForMs`; at/after the deadline discard LKG and
  return unavailable. A first failure returns unavailable for the negative TTL. Repeated failures
  never renew the LKG timestamp or stale deadline. Compute `staleForMs` at response time rather than
  caching an already-aging literal duration;
- a `2_750 ms` outer service deadline prevents a faulty injected resolver from hanging the route;
- resolver throws/rejections normalize to `resolver-failed`; and
- shutdown stops waiting for an in-flight call without allowing cleanup to hang.

Mount parameterless `GET /terminal/theme` behind the existing auth guard. Unauthorized requests
must be rejected before service invocation. Expected absence/failure remains HTTP 200. Add
`Cache-Control: private, no-store`.

Structured logs may contain only a fixed area/action, ready/stale/unavailable status, cache
hit/miss, duration, bounded diagnostic count, revision hash, exact pin, and fixed fallback reason.
Never log a caught error/message, stdout/stderr, command, path, config text/value, theme name, or
environment.

Server tests use injected resolver/clock/deferred promises and cover lazy startup, auth ordering,
disabled default, strict validation, canonical hash mismatch, single-flight, both TTLs, LKG/stale,
remaining `staleForMs`, repeated failures immediately before/at/after the hard 300,000 ms deadline,
outer deadline, close/abort races, no-store, every unavailable reason, and sentinel redaction.
No normal unit/integration test may invoke the native resolver or read the developer's home.

## Milestone 3 — extend the real app fixture

In the current `apps/web/test/server.ts` `TestServerOptions`, retain its existing `AppOptions`
import, WorkspaceEdit clock/driver, journal root, and live defaults, then add:

```ts
terminalTheme?: AppOptions['terminalTheme']
```

and pass it unchanged to `createApp`. Keep its isolated workspace/settings/database behavior.

Web API tests drive the real in-process Elysia/Eden client with a deterministic injected resolver.
They prove auth, ready/stale/unavailable parsing, strict rejection, and query abort without a network
mock or real home read.

## Milestone 4 — authoritative settings and bounded shared query

Do not use `useSettingValue('terminal.integrated.themeSource')` by itself. It returns the registry
default before the settings snapshot exists, which would transiently call the host resolver for a
persisted `workbench` opt-out.

Use `useSettingsDocument` plus `useSettingsProjection` to derive this state machine:

| Settings state      | Source/query behavior                                         | Initial terminal behavior                             |
| ------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| pending             | query disabled; start only shared Ghostty WASM initialization | show existing `RingLoader`; do not create/open/socket |
| error               | authoritative conservative `workbench`; query disabled        | open with workbench appearance                        |
| ready + `workbench` | query disabled                                                | open with workbench appearance                        |
| ready + `auto`      | enable shared query                                           | wait for first ready/unavailable/error settlement     |

Use one query key, `['terminal', 'theme']`, so all panels deduplicate. Configure `retry: false`,
`staleTime: 30_000`, `gcTime: 300_000`, and refetch on focus. Combine TanStack's `AbortSignal` with a
3-second browser deadline and always clear the timer. Normalize timeout/network/validation failure
to workbench only when no validated cached appearance exists.

The query function captures one monotonic request-start and receipt timestamp and publishes a
shared cache envelope containing the validated response and its fixed deadline. For `ready`, use the
conservative request-start timestamp as the successful-observation basis and set its deadline once
to `requestStart + 300_000 ms`. For `stale`, subtract the observed request/response transit from
`staleForMs` and store the equivalent deadline `requestStart + staleForMs`; if it is already past at
receipt, fall back immediately. Merge an incoming envelope before cache publication: for the same
revision, a stale response keeps the earliest existing/candidate deadline, while only a newly
validated `ready` response may establish a new successful-observation deadline. Components and
remounts consume that stored envelope; they must never calculate `now + staleForMs` from cached data.

Once a failure is observed, retain cached appearance only until the envelope's fixed deadline.
Repeated stale responses/refetch failures never extend it. At expiry, synchronously apply workbench,
invalidate/refetch, and keep workbench unless a new `ready` response resets the timestamp; do not
rely on `gcTime` to evict an observed query.

Never gate on `isPending` alone: a disabled query with no data stays pending with
`fetchStatus: 'idle'`. For authoritative auto:

- validated cached data, including while background-refetching, is ready;
- first enabled `fetchStatus: 'fetching'` without data waits;
- a settled error/unavailable without validated cached data is ready with workbench fallback.

Use an injected monotonic clock/timer seam. Tests advance past 300,000 ms under repeated server-stale
and network-error settlements and prove the appearance falls back exactly once without remounting or
allowing a later stale response for the same revision to resurrect it. Add delayed-response,
simultaneous-panel, panel-created-after-cache-fill, and remount cases; every observer must share the
original envelope deadline, and network transit must shorten rather than extend stale retention.

Latch readiness per `rootPath + sessionId + scrollback` mount identity. Once a terminal is admitted,
later source changes/refetches cannot reverse the latch or tear it down. Tests must prove persisted
workbench and settings failure call neither the fetcher/route nor the injected resolver, and a
never-settling request opens with workbench within the browser deadline.

## Milestone 5 — project appearance and surface before first paint

Refactor terminal theme utilities into pure functions that:

- read today's workbench palette;
- select the strict light/dark Ghostty profile from Platform `resolvedTheme`;
- map it to package `TerminalTheme` and `TerminalColorScheme`;
- retain fidelity/degradation metadata; and
- derive bounded CSS surface variables.

Add `--terminal-background` to light/dark CSS with today's corresponding cursor-accent background
value. Map `--terminal-background` to theme background and
`--terminal-cursor-accent` to the new cursor text; preserve all existing workbench colors.

For a Ghostty profile, set on the terminal host before `open`:

- `data-terminal-surface='ghostty'`;
- `--terminal-config-background: <r> <g> <b>`;
- `--terminal-config-opacity: <0..1>`;
- `--terminal-config-blur: <0..255px>`.

Static CSS owns `background: rgb(var(--terminal-config-background) /
var(--terminal-config-opacity))` and both `backdrop-filter` forms. Workbench/unavailable removes the
marker and all three properties so the existing pane content well shows through.

Pass `{ colorScheme, theme }` in `Terminal.create({ appearance: ... })`, apply surface state, and only
then call `terminal.open(host)`. Remove the post-open default-theme write and its flash.

For live `resolvedTheme`, source-setting, or query-result changes, perform one update transaction:

1. `terminal.setAppearance({ colorScheme, theme })`;
2. update/clear the host surface.

Do not place any appearance value in the mount-effect dependency identity. Do not recreate/dispose
the terminal, reopen/reconnect its socket, reset scrollback, or move focus. When switching
workbench→auto, keep workbench until data settles; when switching auto→workbench, apply workbench
immediately and disable future route fetches.

Keep default cells transparent and explicitly colored cells opaque. This matches Ghostty's default
`background-opacity-cells = false`; use the profile's degradation markers instead of claiming exact
behavior for `true`, blur/glass/P3, or dynamic cell-relative colors.

## Milestone 6 — complete package migration and narrow lifecycle seams

Inventory before editing:

```bash
rg -n '\bGhosttyWebGpuTerminal\b' apps/web/src/features/terminal apps/web/test
```

Migrate every exact runtime-class reference to `Terminal`, including `panel.tsx`,
`hooks/use-links.ts`, `utils/commands.ts`, and link tests. Preserve still-current descriptive public
types such as `GhosttyWebGpuTerminalSubscription`. Require the exact-word search to have no matches
at completion; do not add a compatibility alias for the removed runtime class.

Extract a narrow `TerminalHostRuntime` object containing only runtime initialization, terminal
creation, and socket connection. Split an internal `TerminalPanelCore`/mount coordinator that
accepts this object and a theme fetcher; exported production `TerminalPanel` supplies stable real
dependencies. Tests import the narrow core/coordinator directly. Do not add a broad React provider,
global override, or module mock.

DOM lifecycle tests prove:

- runtime initialization may begin while settings/theme authority is pending;
- create/open/socket do not run before admission;
- constructor appearance and host surface exist before `open`;
- initial auto failure uses workbench without a palette flash;
- live source/profile/resolved-theme updates call `setAppearance` and preserve the same terminal,
  socket, scrollback, and focus identity; and
- cleanup cancels pending work and disposes/closes exactly once.

## Milestone 7 — prove the production bundle before publication

Change the server build to externalize exactly `ghostty-webgpu/config-resolver` in addition to its
existing native external. During pre-publication, both manifests remain unchanged and the exact
verified task-stage activation supplies the two consumer `node_modules` links; the web graph imports
only the browser-safe root.
Only Milestone 9, after registry identity matches, adds exact `ghostty-webgpu: 0.1.2` as a production
dependency to both app manifests. The built server must resolve package-relative native assets in
both transient and final registry-installed states. Make the nested Bun build invocation in the
server package script explicit `--no-env-file`; its compilation requires no repo environment.

Add `scripts/terminal-theme-production-smoke.ts`. It must:

- verify the installed package/tarball identity before launch;
- rebuild only `apps/server/dist` by spawning the server's exact package build through absolute Bun
  with `--no-env-file` and a fresh allowlisted build environment; do not call root `build`,
  `scripts/prod.ts`, the web package's env-loading build script, or Vite from inside this
  isolation smoke;
- require `apps/web/dist` from the immediately preceding ordinary full-build gate for static bundle
  inspection, then launch `[process.execPath, '--no-env-file', absoluteDistIndex]`, not source, with
  the child cwd in the temporary root and a unique loopback port;
- construct the child environment as this exact fresh object, never `{ ...process.env }`:

```ts
const buildEnv = {
  HOME: scenarioHome,
  NODE_ENV: 'production',
  TMPDIR: scenarioTmp,
  XDG_CACHE_HOME: scenarioCache,
}

const childEnv = {
  CFFIXED_USER_HOME: scenarioHome,
  FS_HOST: '127.0.0.1',
  FS_METADATA_DB: scenarioDatabase,
  FS_SYSTEM_ROOT: scenarioSystemRoot,
  FS_WATCH: 'false',
  FS_WORKSPACE_ROOT: scenarioWorkspaceRoot,
  HOME: scenarioHome,
  NODE_ENV: 'production',
  OBSERVABILITY_CONSOLE: 'false',
  OBSERVABILITY_DIR: scenarioLogs,
  OBSERVABILITY_ENABLED: 'true',
  OBSERVABILITY_POSTHOG_ENABLED: 'false',
  PLATFORM_SECRETS_FILE: scenarioSecrets,
  PLATFORM_SETTINGS_FILE: scenarioSettings,
  PORT: String(uniquePort),
  SERVER_ALLOWED_ORIGINS: trustedOrigin,
  TMPDIR: scenarioTmp,
  XDG_CACHE_HOME: scenarioCache,
  XDG_CONFIG_HOME: scenarioConfig,
}
```

- keep every path above beneath the scenario root, omit every PostHog API-key/host alias, and use
  the isolated file logs for assertions without permitting a remote drain;
- run independent ready and absent-config scenarios in fresh child roots; place a synthetic
  dual-theme config at the pinned official default location only for the ready scenario;
- request the real authenticated route with an allowed Origin in each scenario;
- assert ready status, exact upstream/revision formats, distinct profiles, and two 256-entry
  palettes in the ready scenario, and `config-not-found` plus an unchanged config root in the absent
  scenario;
- terminate with `TERM`, escalate to `KILL` after a bounded wait, and await exit;
- verify the fixture config/tree was not changed except files the smoke deliberately created; and
- clean the temporary root in `finally`.

This is a bounded server-build/runtime test, not a development server. The script itself is launched
with Bun `--no-env-file`; its server build subprocess and server child also use `--no-env-file` and
fresh explicit environments. It must never load the repo `.env`, inherit credentials/search paths,
write repo logs, expose the machine filesystem root, or inspect the developer's real home. Assert
both effective environment objects contain no key outside their allowlists before spawning.

Inspect outputs:

- `apps/server/dist/index.js` retains an external `ghostty-webgpu/config-resolver` import;
- runtime lookup resolves manifest/native resources from the exact installed tarball;
- `apps/web/dist` contains no `config-resolver`, `node:child_process`, native manifest/path/hash, or
  native executable bytes; and
- terminal-theme log records contain only the allowed fixed fields. Existing unrelated startup
  path logging is not evidence that the resolver logged config identity; assert the synthetic
  secret/theme/diagnostic sentinels are absent globally.

Stop if bundle rewriting breaks `import.meta.url`, resources are missing, or native code enters the
browser bundle.

## Milestone 8 — pre-publication gates and real acceptance

Run against the exact transient tarball:

```bash
cd /Users/shaul/Desktop/D/platform
bun run settings:schema
bun run settings:reference
bun run settings:schema:check
bun run --filter @workspace/contracts test -- src/tests/terminal-theme.test.ts

cd apps/server
bun --bun vitest run \
  src/terminal/tests/theme-service.test.ts \
  src/terminal/tests/theme-routes.test.ts \
  src/tests/app.test.ts

cd ../web
bun --bun vitest run --project node \
  src/features/terminal/utils/tests/theme.test.ts \
  src/features/terminal/tests/theme-api.test.ts
bun --bun vitest run --project dom \
  src/features/terminal/tests/appearance.test.tsx

cd ../..
bun run test:scripts
bun run --filter @workspace/contracts test
bun run --filter @workspace/ui test
bun run --filter server test
bun run --filter web test
bun run --filter @workspace/contracts typecheck
bun run --filter @workspace/ui typecheck
bun run --filter server typecheck
bun run --filter web typecheck
bun run --filter @workspace/contracts lint
bun run --filter @workspace/ui lint
bun run --filter server lint
bun run --filter web lint
bun run --filter @workspace/contracts format:check
bun run --filter @workspace/ui format:check
bun run --filter server format:check
bun run --filter web format:check
bun run build
bun --no-env-file scripts/terminal-theme-production-smoke.ts
git diff --check
```

Adapt a filename only when the live convention requires it, and update this plan before execution so
the command list remains truthful.

Reuse the running Platform development app only for real-config visual acceptance; do not start a
second development server or try to replace that process's home/config environment in place. With
the existing launcher confirmed on the current built sources, keep the user's config unchanged and
verify native Ghostty and Platform dark mode show the same
static configured palette for the same prompt and `cal` output. Verify Platform light mode selects
the light profile without terminal/socket replacement. Dynamic-cell colors, blur, glass, P3, and
opacity-cells differences must agree with the reported degradation flags. Record screenshots and
sanitized revision hashes only.

No-config, resolver-error, settings-error, source switching, stale refresh, and the absence of an
initial palette flash are automated gates, not manual environment switching. Cover them with the
isolated ready/absent production-smoke children plus server fake-clock tests and browser DOM/query
tests. The query tests advance beyond `30_000 ms`, trigger refocus, prove a pre-stale refocus does
not fetch, and assert no remount, reconnect, focus loss, or scrollback loss. Do not require a human
to restart the running development server under a different `HOME`.

Do not proceed to publication until automated, production-bundle, and visual gates all pass against
the exact reviewed tarball.

After recording that evidence, run the post-baseline restoration sequence and prove the task state is
cleared before presenting the publication pause. Milestone 9 therefore always resumes with the
transient install absent; its only package mutation is the approved registry dependency update.

## Milestone 9 — operator publication, registry pin, and final rerun

Stop and present the exact tarball path, identity JSON, evidence JSON, SHA-256, npm
integrity/shasum, assembly/rebuild/native-smoke matrices, Platform tests/build/dist smoke, and visual
acceptance to the operator. The executor is not authorized to publish.

If and only if the operator approves, the operator publishes the existing file—not a directory and
not a new pack. Immediately before that irreversible mutation, rerun the strict three-file verifier
from the clean `packageSourceHead`; permit no intervening write/repack/copy command between its
success and `npm publish`:

```bash
cd /Users/shaul/Desktop/D/ghostty-webgpu
bun scripts/create-release-candidate.ts --verify \
  --tarball .artifacts/ghostty-webgpu-0.1.2.tgz \
  --identity .artifacts/ghostty-webgpu-0.1.2.identity.json \
  --evidence .artifacts/ghostty-webgpu-0.1.2.evidence.json
npm publish /Users/shaul/Desktop/D/ghostty-webgpu/.artifacts/ghostty-webgpu-0.1.2.tgz
npm view ghostty-webgpu@0.1.2 version dist.integrity dist.shasum
```

Registry version, integrity, and shasum must match the reviewed identity exactly. Stop on mismatch.

Only then:

1. set exact `"ghostty-webgpu": "0.1.2"` in both `apps/web/package.json` and
   `apps/server/package.json`;
2. confirm the transient task-state directory is absent, then run `bun install` from the registry;
3. verify `bun.lock` resolves registry `0.1.2` with the expected integrity and contains no local
   path/link/tarball reference;
4. perform a clean/frozen consumer install in a temporary copy or CI job; and
5. rerun every focused test, named Gate 0 workspace check, build, bundle inspection, production
   smoke, and real dark/light/workbench acceptance; never use a bare root verify.

Do not mark the plan complete merely because the package was published.

## STOP conditions

Stop rather than improvise if:

- Plan 066 evidence/artifact is missing, mismatched, repacked, or has the wrong package/upstream
  version;
- an unowned dirty change overlaps an in-scope symbol or root scheduling is absent;
- any browser input is needed for a config path, executable, argv, cwd, or environment;
- strict validation would require exposing raw config/path/theme/stderr/diagnostic text;
- cold persisted workbench or settings failure cannot guarantee zero host reads;
- first exact appearance requires a post-open flash/remount;
- live changes require a new terminal or socket;
- resolver/native code enters the web graph;
- the externalized helper cannot run from built `dist` and installed package assets;
- the production smoke can reach the real home;
- an automated or manual gate regresses after reconciliation;
- publication is unapproved or registry identity differs; or
- Platform would retain a local/link/tarball dependency.

Every expected resolver failure without a last-known-good appearance falls back to the current
workbench terminal palette. The only exception is sanitized stale retention before the hard
five-minute deadline measured from the last validated success; failures cannot extend it and it never
exposes new failed output.

## Completion checklist

- [ ] Scheduling/artifact identity/dirty overlaps are reconciled without losing user work.
- [ ] Maintained read-only verifier accepts the tgz, identity, and full evidence bundle.
- [ ] Strict bounded contract rejects all malformed, extra, duplicate, and unbounded values.
- [ ] Machine-scoped source setting defaults to auto and is documented/live.
- [ ] Persisted workbench and settings failure cause zero theme route/resolver calls.
- [ ] Route is auth-first, no-store, parameterless, lazy, cached, single-flight, and sanitized.
- [ ] Default/test app construction cannot read real host config.
- [ ] Platform `resolvedTheme` selects the profile.
- [ ] First paint is configured; live changes preserve terminal/socket/scrollback/focus.
- [ ] Workbench fallback clears every dynamic surface property.
- [ ] Exact runtime-class migration has no remaining references.
- [ ] Tests use explicit server/runtime/socket/fetch seams, not module mocks.
- [ ] Built server resolves external package assets; web output contains none.
- [ ] Pre-publication automated, built-runtime, and real visual gates pass against exact bytes.
- [ ] Transient package state is restored and its local task directory cleared before the publication
      pause.
- [ ] Authorized operator published that same tarball and registry identity matches.
- [ ] Both apps pin registry `0.1.2`; lock/install contain no local dependency.
- [ ] Final clean-install named workspace checks/build/dist smoke/visual acceptance pass.
- [ ] Responses, terminal-theme logs, reports, and screenshots contain no config-sensitive material.
