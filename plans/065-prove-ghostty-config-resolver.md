# Plan 065: Prove the pinned Ghostty config resolver boundary

> **Executor instructions**: Read this plan completely, then read
> `/Users/shaul/Desktop/D/platform/AGENTS.md`, `/Users/shaul/Desktop/D/platform/PLAN.md`,
> `/Users/shaul/Desktop/D/ghostty-webgpu/AGENTS.md`, and
> `/Users/shaul/.agents/skills/never-nester/SKILL.md`. Execute every gate in order.
>
> This is a bounded feasibility proof in `ghostty-webgpu`, not a production implementation.
> Do not modify Platform source, package exports, renderer APIs, package versions, or published
> artifacts. Do not branch, commit, push, publish, or open a PR unless the operator asks.

## Status

- **State**: In progress — create-capable macOS discovery skipped; remaining proof gates continue
- **Priority**: P1
- **Effort**: S–M
- **Risk**: HIGH — upstream `Config` is not part of Ghostty's downstream `vt` library boundary
- **Depends on**: none; independent terminal lane
- **Planned at**: Platform `1fc53a8cb7113767cf6e88024c366a01fb919bca`, `ghostty-webgpu`
  `3c3e07edef23cdbbe141410432e89276cb6504b2`, upstream Ghostty
  `c8554f28e0efe2f5595f32020371c34b25ec628f`, 2026-08-25
- **Unlocks**: Plan 066 only when the evidence report ends in `Decision: PASS`

The first revised execution ended in `Decision: FAIL` because the pinned official
`global.init(.tool)` and `SharedDeps` graph necessarily retain and initialize GUI-only shader and
renderer dependencies. On 2026-08-28 the operator accepted that graph only for a stripped,
platform-specific optional host helper, so that decision is superseded and this proof is reopened.
The replacement execution next found that Ghostty's macOS Application Support candidate builders
call Foundation directory lookup with `create: true`. The operator explicitly directed that this
must not close the proof as `FAIL`. Under the accepted fixed-candidate divergence, the proof must
skip the writing loader and both create-capable Application Support builders, derive those fixed
candidates read-only, and continue all remaining gates. Plans 066–067 remain blocked and
unauthorized until the replacement report is a complete `PASS`.

At planning time this lane was not yet scheduled by root `PLAN.md`, and the active local compiler
was Zig `0.15.2`. Root has now scheduled the reopened proof. Every replacement run must still use
Zig `0.16.0` exactly; scheduling is not permission to weaken either gate.

The first execution found that `Config.loadDefaultFiles` can create a template when every normal
candidate is absent. On 2026-08-28 the operator accepted one narrow divergence: proof and production
code may derive the fixed default candidates from explicit isolated roots and the pinned constant
path suffixes, preserve the pinned paths, load order, and duplicate behavior in explicit tests, and
pass each existing file to Ghostty's read-only loading APIs. They must never call the normal writing
loader or any candidate builder capable of creating a directory. This acceptance does not permit
copied parsing, include, theme, conditional, diagnostic, color, or palette logic.

The macOS discovery finding clarifies this same divergence rather than adding a terminal condition:
the legacy/current Application Support candidates must be derived without invoking Foundation's
create-capable directory lookup. Candidate derivation performs no filesystem mutation; the first
filesystem operation is a read-only open of the already-derived path.

The next execution proved that the only official Config-capable initializer and executable build
graph retain GUI-only shader/renderer dependencies. The operator accepted a second narrow
divergence: those pinned dependencies may remain statically retained in a stripped helper when the
helper is delivered as a platform-specific optional host dependency. The host must dynamically
load and spawn it only after the registered appearance feature is enabled. Missing optional bytes
must preserve the existing appearance without a config read, subprocess, runtime download, or
startup failure.

This is a tactical packaging allowance, not the preferred upstream shape. If a future plan proposes
a Ghostty fork, first prefer contributing a Config-only initializer and matching minimal build
target upstream. Neither this plan nor the allowance authorizes a fork, local upstream patch, or
copied build graph.

## Decision this plan must make

Determine whether an unmodified checkout of the package's exact Ghostty pin can power a small,
read-only native helper that:

1. loads the normal user config with the accepted fixed-candidate enumeration and Ghostty's own
   include, theme, reset, named-color, conditional, diagnostic, and palette-generation semantics;
2. resolves independent light and dark visual profiles correctly;
3. can be built for `darwin-arm64`, `darwin-x64`, `linux-arm64`, and `linux-x64` without a maintained
   Ghostty fork or installed Ghostty at runtime;
4. has a bounded resource/dependency layout suitable for an npm package; and
5. can avoid all writes and emit only a sanitized visual projection.

The answer may be **FAIL**. A precise failure is a successful outcome for this proof. Do not turn an
unknown upstream build graph into production code by guesswork.

## Why the proof comes first

The browser color difference is already explained: Platform replaces native Ghostty's palette with
its own CSS terminal palette. Reading the user's real Ghostty config is a sound direction, but the
obvious shortcuts are not sound:

- `ghostty +show-config` cannot provide the requested pair reliably. Its CLI config state begins in
  light mode; the GUI applies its runtime conditional state later, so the installed command can
  report `3024 Day` while native Ghostty visibly uses dark `Afterglow`.
- A TypeScript parser would have to duplicate Ghostty's search paths, recursive includes, cycle and
  precedence rules, resets, built-in and file themes, named colors, conditional state, diagnostics,
  dynamic cell-relative colors, and palette generation.
- The pinned downstream `GhosttyZig` boundary exposes `vt`/`vt_c`, not `Config`. `Config.zig` imports
  generated modules and `global.zig`, whose initialization reaches broader runtime dependencies.

Plan 065 establishes the exact build and initialization boundary before Plan 066 commits to a
package architecture.

## Required deliverables

Only these implementation-proof paths may be added or edited in `ghostty-webgpu`:

- `scripts/config-resolver-proof/**`
- `.github/workflows/config-resolver-proof.yml` for the one four-target PASS evidence run
- `docs/config-resolver-feasibility.md`
- `docs/config-resolver-feasibility.json`

Do not edit `package.json`, `bun.lock`, `scripts/build-wasm.ts`, `src/**`, `types/**`, either checked-in
WASM file, package metadata, or Platform source. Proof build output belongs under a temporary
directory and must not be checked in.

The evidence report is the durable deliverable. Proof code must be small, reproducible, and useful
to Plan 066, but it is not a supported API.

## Gate 0 — scheduling, drift, and immutable inputs

Before editing:

```bash
cd /Users/shaul/Desktop/D/platform
git rev-parse HEAD
git status --short
rg -n "065|066|067" PLAN.md plans/README.md

cd /Users/shaul/Desktop/D/ghostty-webgpu
git rev-parse HEAD
git status --short
rg -n "GHOSTTY_SOURCE_(REPOSITORY|REVISION)" src/core/version.ts
zig version
shasum -a 256 ghostty-vt.wasm bridge.wasm scripts/build-wasm.ts
```

`PLAN.md` is authoritative. If it has not scheduled this independent terminal lane when execution is
requested, stop and ask the operator where to place it. Preserve all user-owned changes. If an
allowed proof path is already dirty, establish ownership before editing.

Use Zig **0.16.0 exactly** for reproducible evidence. If it is unavailable, record that as an
environment blocker; do not silently use a different compiler. Use only the revision in
`src/core/version.ts`, and verify it is the full revision listed in **Status**.

Record the three Gate 0 SHA-256 values in the report. They must be unchanged at completion.

### Canonical pinned-upstream identity

Compute `upstreamTreeSha256` from the pinned Git object tree, never by walking the checkout. Require
`git rev-parse HEAD` to equal the pin and `git rev-parse --show-object-format` to be `sha1`, then parse
`git ls-tree -r -z --full-tree <pin>` as NUL-delimited raw-byte records. Accept only blob modes
`100644`, `100755`, and `120000`, plus gitlink mode `160000`; reject every other mode/type. Sort the
parsed records by unsigned raw pathname bytes and hash this exact binary stream:

```text
UTF8("ghostty-upstream-tree-v1\0")
for each record:
  uint32be(path byte length) || raw path bytes
  six ASCII mode bytes
  uint8(1 for blob, 2 for gitlink)
  uint64be(content byte length) || content identity
```

For a blob, `content byte length` is the original blob length and `content identity` is the 32 raw
bytes of SHA-256 over the exact bytes returned by `git cat-file blob <object-id>`. A
mode-`120000` symlink is therefore hashed as its stored link-target blob and is never dereferenced.
For a gitlink, the length is `20` and `content identity` is the 20 decoded bytes of its exact 40-hex
commit ID; do not traverse an ambient submodule checkout. The type byte fixes the content-identity
width, so the stream is unambiguous.

This enumeration excludes `.git`, mtimes, filesystem ownership, untracked/ignored files, and caches
by construction. Any build-consumed submodule, downloaded dependency, generated resource, SDK, or
other byte outside the top-level blob set must be a separate origin/revision-or-URL/length/SHA-256
entry in `proofRecipeSha256`; unresolved external input identity makes the proof `FAIL`. Freeze tests
show that two checkouts with different Git metadata, mtimes, and untracked caches produce the same
digest, while a tracked path, mode, blob byte, symlink target, or gitlink change changes it. Plan 066
must reuse this exact versioned algorithm and vectors.

### Canonical proof recipe identity

Add strict `scripts/config-resolver-proof/proof-recipe.schema.json` and canonical
`proof-recipe.json`. Define `proofCanonicalBytes(value)` as strict-schema validation followed by RFC
8785 JSON Canonicalization Scheme UTF-8 bytes and exactly one LF. The checked recipe file must equal
those bytes; `proofRecipeSha256` is SHA-256 of the complete raw file. It never contains its own hash.

The recursively strict recipe contains schema version `1`, exact upstream repository/revision/tree
digest, Zig version `0.16.0`, one shared `SOURCE_DATE_EPOCH`, and exactly four target-keyed records.
Each target record contains its asserted runner image/version and architecture, target triple,
optimization mode, complete ordered build/link/strip argv, a sorted array of explicit build
environment name/value pairs, and sorted tool/input arrays. Tool records have a fixed role
`zig|linker|strip|sdk-or-sysroot`, name, version, byte length, SHA-256, and exactly one acquisition
variant:

- `official-download`: immutable HTTPS URL plus archive byte length/SHA-256;
- `git`: repository URL, 40-hex revision, and `ghostty-upstream-tree-v1` digest; or
- `runner-component`: runner image/version, POSIX component path, `file|external-tree-v1` content
  kind, component byte length/SHA-256, and for macOS the Xcode/SDK version/build plus
  `SDKSettings.json` SHA-256.

External input records use fixed roles
`upstream-submodule|dependency-archive|generated-resource-source|runtime-resource`, a stable ASCII
ID, and one of the same acquisition variants. A generated byte must identify all source records and
the exact generating argv; it cannot be represented only by an output pathname. Arrays sort by role
then ID/name using unsigned UTF-8 bytes; environment names are unique and byte-sorted. Strings,
counts, paths, byte lengths, versions, URLs, and hashes use the bounds later required by the strict
evidence verifier. No ambient path, floating version, mutable URL, free-form command string, or
inherited environment entry is allowed.

`external-tree-v1` hashes an SDK/sysroot directory without archive-format or filesystem-metadata
drift. Recursively `lstat` beneath the verified root; reject devices/FIFOs/sockets and any symlink
escaping that root. Sort normalized UTF-8 relative paths by unsigned bytes and hash header
`ghostty-external-tree-v1\0`, then for each entry hash a uint32be path length, path bytes, one type
byte (`1` directory, `2` regular, `3` symlink), uint16be permission bits, and uint64be content
length. A directory has zero content and no identity bytes; a regular file adds the 32 raw bytes of
its exact content SHA-256; a symlink adds the 32 raw bytes of SHA-256 over its stored target bytes
without dereferencing. The target's own entry binds dereferenced content. Ignore mtimes, uid/gid,
xattrs, and inode/hardlink identity. The record's byte length is the sum of regular-file and symlink-
target lengths. Freeze file/symlink/empty-directory/mode/order/escape vectors.

The proof runner loads this recipe, recomputes the upstream tree, verifies every locally materialized
tool/input byte against its record before use, and invokes only the recorded argv/environment.
`verify-evidence.ts` revalidates canonical recipe bytes, recomputes `proofRecipeSha256`, requires that
digest in every matrix row, and compares every recorded runner/tool hash with the target recipe.
Golden tests mutate every recipe field/order/acquisition variant and prove Bun and Node compute the
same digest. If a platform SDK cannot be fully downloaded, its immutable runner-image identity plus
the explicitly hashed SDK settings, linker, and every inspected build component is the accepted
identity boundary; an unversioned ambient SDK is `FAIL`.

## Proof invariants

The proof must obey these constraints from its first executable version:

- acquire an ordinary detached checkout of `https://github.com/ghostty-org/ghostty.git` at the exact
  pin in a temporary/cache directory;
- never copy Ghostty source into this repository, patch the checkout, use a maintained fork, or
  invoke an installed `ghostty` binary;
- prove the checkout remains clean with `git diff --exit-code` and `git status --short`;
- locate upstream modules and resources from explicit build inputs, never the process cwd;
- use fixed argv, no shell, no browser-controlled path, and isolated fixture homes;
- install a no-op Zig log sink or otherwise prove that raw Ghostty warnings cannot reach stdout or
  stderr;
- emit one bounded JSON value containing only booleans, numbers, fixed enums, RGB values, palette
  entries, the pinned revision, and a diagnostic count;
- never emit config contents, include paths, theme names, environment values, command lines,
  diagnostic messages, or native error text; and
- never create a config/template or write anywhere beneath the isolated home/config roots.

The production contract is deliberately deferred to Plan 066. The proof JSON only needs enough
strict structure to establish that every required value can be extracted without leaking source
material.

Use this exact proof-only shape:

```ts
type ProofRgb = { readonly r: number; readonly g: number; readonly b: number }

type ProofColor =
  | { readonly kind: 'unset' }
  | { readonly kind: 'rgb'; readonly value: ProofRgb }
  | { readonly kind: 'cell-foreground' }
  | { readonly kind: 'cell-background' }

type ProofProfile = {
  readonly background: ProofRgb
  readonly foreground: ProofRgb
  readonly cursorColor: ProofColor
  readonly cursorText: ProofColor
  readonly selectionBackground: ProofColor
  readonly selectionForeground: ProofColor
  readonly minimumContrast: number
  readonly palette: readonly ProofRgb[]
  readonly windowColorspace: 'display-p3' | 'srgb'
  readonly surface: {
    readonly backgroundOpacity: number
    readonly backgroundOpacityCells: boolean
    readonly backgroundBlur:
      | { readonly kind: 'none' }
      | { readonly kind: 'radius'; readonly value: number }
      | { readonly kind: 'macos-glass'; readonly variant: 'clear' | 'regular' }
  }
}

type ProofResult =
  | {
      readonly proofSchemaVersion: 1
      readonly status: 'ready'
      readonly upstreamRevision: 'c8554f28e0efe2f5595f32020371c34b25ec628f'
      readonly diagnosticCount: number
      readonly profiles: { readonly light: ProofProfile; readonly dark: ProofProfile }
    }
  | {
      readonly proofSchemaVersion: 1
      readonly status: 'not-configured' | 'resolver-error'
      readonly upstreamRevision: 'c8554f28e0efe2f5595f32020371c34b25ec628f'
    }
```

RGB channels are integers `0..255`; palettes contain exactly 256 entries; opacity is finite
`0..1`; minimum contrast is finite `1..21`; numeric blur is integer `0..255`; diagnostic count
saturates at `65_535`; stdout is at most 128 KiB; ordinary stderr is empty. Reject unknown keys at
every depth. The proof preserves dynamic color tags; only Plan 066 decides their browser fallback.

## Milestone 1 — map the exact upstream build graph

Create a proof runner under `scripts/config-resolver-proof/` that acquires and verifies the pinned
checkout, prepares a temporary build/output root, and invokes a sibling `build.zig`/Zig entry point.
Do not refactor or import `scripts/build-wasm.ts`; independent acquisition is intentional for this
proof.

Trace and record, with exact pinned source paths and symbols:

1. how `Config` obtains generated `build_config` and `help_strings` modules;
2. the minimal `global.zig` initialization and deinitialization needed for config/theme loading;
3. every Zig module, generated source, C/C++ library, framework, data file, built-in theme resource,
   and environment assumption reachable by the helper;
4. which dependencies can be removed by using an official upstream build option versus which are
   mandatory; and
5. the full helper initialization, light resolution, conditional replay, and deinitialization
   sequence, including ownership of a copied profile.

The investigation must account for the pinned equivalents of `src/config/Config.zig`,
`src/config/conditional.zig`, config file/theme loaders, `src/global.zig`, terminal color generation,
`src/build/GhosttyZig.zig`, shared dependency/resource builders, generated build/options/help
modules, and the pinned built-in-theme dependency. Use upstream's auxiliary-tool lifecycle such as
`global.init(.tool)` only if evidence shows it is the smallest valid official path. If correct config
initialization retains GUI-only runtime dependencies, record their exact stripped cost and runtime
initialization path under the accepted optional-heavy-helper divergence. It is still `FAIL` if those
dependencies cannot be bounded to the matching optional host package or require an installed
system GUI stack beyond the compatibility contract.

The proof may add a standalone executable to the unmodified upstream build graph or consume
upstream modules from the proof's `build.zig`. It may not edit the checkout or maintain copied
upstream build definitions. If neither route works, document the smallest missing upstream boundary
and mark the final decision `FAIL`.

The report must include the exact successful build command, module dependency diagram in text, all
linked runtime dependencies, resource paths relative to the eventual package, and stripped and
unstripped host binary sizes. A sentence such as “build Config with Zig” is not sufficient.

## Milestone 2 — prove semantic extraction with isolated fixtures

Add fixture trees under `scripts/config-resolver-proof/fixtures/`. Fixture contents are synthetic
and may be checked in; each tree must use a sentinel path/value/theme label so leakage tests can
detect accidental disclosure.

Exercise all of these cases through Ghostty's official implementation:

1. **Absent config** — an empty isolated home/config root returns an unavailable status. Hash and
   recursively list the tree before and after; no file or directory may be created.
2. **Normal search** — put the fixture only at each official default location documented by the
   pinned source. Do not pass its config filename as a CLI argument. The helper must find it.
3. **Include graph** — nested and repeated `config-file` entries prove official order, relative path
   handling, cycle diagnostics, reset, and last-value precedence.
4. **Theme and colors** — built-in/file theme lookup, named colors, explicit RGB colors, and a
   partial palette prove final effective colors come from Ghostty rather than a second parser.
5. **Palette generation** — preserve Ghostty's explicit-entry mask until official generation runs;
   prove explicit indices survive and generated entries match the pinned implementation across all
   256 final entries.
6. **Conditional pair** — `theme = dark:Afterglow,light:3024 Day` must produce distinct, correct
   light and dark profiles. Resolve light, then use the official dark conditional-state transition;
   never use a second CLI process with an assumed OS theme.
7. **No conditional change** — when `changeConditionalState` returns `null`, the dark profile is an
   owned copy of light. Prove correct deinitialization and equality without aliasing freed state.
8. **Diagnostics** — count them only. No message, file, line, source, or native error text may be in
   output.
9. **Dynamic colors** — detect `cell-foreground`/`cell-background` for cursor color, cursor text,
   selection foreground, and selection background without silently converting them to an exact
   static RGB value. Record the pinned renderer semantics and candidate deterministic static
   fallbacks for Plan 066.
10. **Surface values** — extract background opacity, background-opacity-cells, numeric/boolean blur,
    and macOS glass/display-P3 variants as typed values or explicit unsupported/degraded enums.

The no-write property must be structural, not a check-then-load convention. Never call
`loadDefaultFiles` or another entry point with a create-template branch. Derive the fixed
legacy/current XDG candidates and, on macOS, the fixed legacy/current Application Support
candidates from explicit isolated roots and pinned constant suffixes. Do not call an API or path
builder capable of directory creation. Freeze the exact candidate paths, pinned load order, and
duplicate-load behavior in tests. Open each candidate only through a read-only upstream file
loader, then use Ghostty's recursive load and finalization APIs. Deletion or rename between
derivation and open must return the fixed unavailable result without falling back to a writing
entry point. This fixed-candidate derivation is the only accepted policy duplication.

Add adversarial fixtures that pause after candidate discovery, then delete the candidate or rename
it out of the tree before the read begins. Both races must return the fixed unavailable result,
leave the empty home/config roots byte-for-byte unchanged, and prove no fallback call can create a
file or directory. Repeat the race at each official default location.

For `windowColorspace = display-p3`, the report must freeze one deterministic conversion before
Plan 066. Use IEEE-754 binary64; decode Display-P3 channels with the sRGB transfer function, apply
the full-precision Display-P3-to-XYZ-D65 and XYZ-D65-to-linear-sRGB matrices recorded in the report,
clamp linear sRGB channels to `[0, 1]`, apply the inverse sRGB transfer function, multiply by 255,
and round half up to an integer. Record all constants and operation order. Golden vectors must
cover black/white, all three primaries, an in-gamut mixed color, negative and greater-than-one gamut
clipping, both transfer-function thresholds, and values on either side of an 8-bit rounding
boundary. If the pinned representation requires different semantics, document and prove those
exact semantics instead; an unspecified platform color conversion is a `FAIL`.

The mandatory dual-profile fixture contains
`theme = dark:Afterglow,light:3024 Day`, opacity `0.9`, and blur radius `20`. At the exact pin, assert
at minimum: dark background `#212121`, foreground `#d0d0d0`, cursor text `#151515`, palette indices
0 `#151515` and 6 `#7dd6cf`; light background `#f7f7f7`, foreground `#4a4543`, cursor text `#f7f7f7`,
and palette indices 0 `#090300` and 15 `#f7f7f7`. Both profiles contain 256 colors and retain the
surface values.

Expected values must be asserted from the fixture and pinned source semantics, not copied from the
developer's installed Ghostty output. Never execute this proof against the developer's real home;
the eventual real-config comparison belongs to Plan 067's explicit acceptance gate.

Run leakage assertions over stdout, stderr, thrown errors, test logs, and the report. None may
contain the sentinel path, secret value, theme label, diagnostic text, or a raw config line. The
checked-in fixture source itself is the only exception.

## Milestone 3 — prove the supported native matrix

Use the same unmodified build graph for exactly these targets:

| Target         | Required result                                                                            |
| -------------- | ------------------------------------------------------------------------------------------ |
| `darwin-arm64` | compile, strip, inspect dependencies/resources, and execute on a native arm64 macOS runner |
| `darwin-x64`   | compile, strip, inspect dependencies/resources, and execute on a native x64 macOS runner   |
| `linux-arm64`  | compile, strip, inspect dependencies/resources, and execute on a native arm64 Linux runner |
| `linux-x64`    | compile, strip, inspect dependencies/resources, and execute on a native x64 Linux runner   |

Cross-compilation alone is not an execution result. The proof workflow must assert the
runner's `uname -s`/`uname -m`, build from the exact source and Zig pins, run the same semantic and
no-write fixture suite, inspect dependencies with `otool -L` on Darwin or `readelf -d`/`ldd` on
Linux, and upload only evidence—not release artifacts.

If obtaining those native runners requires committing/pushing the proof workflow, prepare it and
pause for explicit operator authorization. The need for CI does not grant commit, push, or external
workflow authority. Without the four native results the report remains incomplete, not `PASS`.

The workflow is `workflow_dispatch` only with expected proof-source HEAD and upstream-pin inputs.
Use `permissions: { contents: read }`, no secrets, no package/release/id-token write, checkout with
`persist-credentials: false`, full-commit action pins, exact official Zig archive URL/SHA-256, and
bounded evidence retention. It has no push/PR/tag trigger and uploads only strict evidence files.
Changing an action, runner image, compiler archive, or proof recipe requires a fresh run and digest.

For every target, record:

- runner image and native architecture;
- exact build and strip commands;
- executable and resource SHA-256 values and byte lengths;
- `file` output and dynamic dependency list;
- required minimum OS/libc assumptions and an exact Node-and-Bun runtime probe for them;
- whether resources can be addressed relative to the executable; and
- semantic/no-write test result.

For Darwin, freeze an explicit deployment target and prove how both Node and Bun obtain a product
version that can be compared before spawn. For Linux, prefer a fully static binary. If it is
dynamically linked, identify the exact libc family/minimum and prove a pre-spawn detector on native
glibc/musl runners plus too-old/mismatched fixtures. If compatibility cannot be established without
trying to execute the resolver, the proposed package boundary is not a `PASS`.

The proof runner exposes one reviewed interface for CI and local reproduction, for example:

```bash
bun scripts/config-resolver-proof/run.ts --mode build --target aarch64-macos \
  --evidence /tmp/plan-065-aarch64-macos-build.json
bun scripts/config-resolver-proof/run.ts --mode verify --target aarch64-macos \
  --evidence /tmp/plan-065-aarch64-macos-verify.json
```

Record the exact equivalent triples for the other three targets. `verify` rejects a nonmatching
host, relocates the bundle, removes Ghostty/Zig/source from its runtime `PATH`, and runs the complete
fixture suite.

Set a proposed per-target and total npm-package size ceiling from measured evidence. Plan 066 may
accept that ceiling or stop for an operator decision; it must not invent one after packaging.

## Milestone 4 — write the go/no-go report and strict summary

`docs/config-resolver-feasibility.md` must be self-contained and use these headings:

1. `Decision: PASS` or `Decision: FAIL` as the final non-blank line as well as in the summary;
2. exact repositories, revisions, Zig version, runner images, and proof command;
3. exact build/module/generated-source/resource graph;
4. initialization, light/dark transition, `null` transition ownership, and deinit sequence;
5. semantic fixture results, including palette mask and every dynamic color;
6. no-write and privacy/leakage results;
7. four-target table with hashes, sizes, dependencies, OS assumptions, and native execution result;
8. proposed package layout, size ceiling, and runtime selection algorithm;
9. known fidelity degradations and deterministic fallback recommendations; and
10. blockers or residual risks.

Also write `docs/config-resolver-feasibility.json` and a non-writing
`scripts/config-resolver-proof/verify-evidence.ts`. The JSON is recursively strict, bounded, and has
this exact top-level shape:

```ts
type ProofTarget = 'darwin-arm64' | 'darwin-x64' | 'linux-arm64' | 'linux-x64'
type ProofTargetEvidence = {
  readonly runId: string
  readonly runAttempt: number
  readonly ghosttyWebGpuHead: string
  readonly upstreamTreeSha256: string
  readonly proofRecipeSha256: string
  readonly sourceDateEpoch: number
  readonly runner: {
    readonly os: 'darwin' | 'linux'
    readonly arch: 'arm64' | 'x64'
    readonly image: string
    readonly imageVersion: string
  }
  readonly toolchain: {
    readonly zigSha256: string
    readonly linkerSha256: string
    readonly stripSha256: string
    readonly sdkOrSysrootSha256: string
  }
  readonly nativeExecution: 'pass' | 'fail' | 'incomplete'
  readonly artifactSha256: string | null
  readonly artifactBytes: number
  readonly semanticFixtures: 'pass' | 'fail' | 'incomplete'
  readonly noWriteFixtures: 'pass' | 'fail' | 'incomplete'
  readonly dependencies: 'pass' | 'fail' | 'incomplete'
  readonly compatibilityProbe: 'pass' | 'fail' | 'incomplete'
  readonly relocation: 'pass' | 'fail' | 'incomplete'
}
type ProofEvidence = {
  readonly schemaVersion: 1
  readonly decision: 'PASS' | 'FAIL' | 'INCOMPLETE'
  readonly ghosttyWebGpuHead: string
  readonly upstreamRevision: 'c8554f28e0efe2f5595f32020371c34b25ec628f'
  readonly zigVersion: '0.16.0'
  readonly reportSha256: string
  readonly checks: {
    readonly officialReadOnlyGraph: 'pass' | 'fail' | 'incomplete'
    readonly absentNoWrite: 'pass' | 'fail' | 'incomplete'
    readonly deleteRaceNoWrite: 'pass' | 'fail' | 'incomplete'
    readonly renameRaceNoWrite: 'pass' | 'fail' | 'incomplete'
    readonly privacy: 'pass' | 'fail' | 'incomplete'
    readonly displayP3Vectors: 'pass' | 'fail' | 'incomplete'
  }
  readonly matrix: Readonly<Record<ProofTarget, ProofTargetEvidence>>
  readonly ceilings: {
    readonly perTargetBytes: Readonly<Record<ProofTarget, number>>
    readonly totalPackageBytes: number
    readonly operatorAcceptance: 'pending' | 'accepted'
  }
}
```

Present artifacts and all provenance digests use 64-character lowercase hexadecimal hashes; a target
without an artifact uses `null` and zero bytes. Git heads are 40 lowercase hex; run IDs match
`^[1-9][0-9]{0,19}$`; attempts are integer `1..100`; epochs are integer
`946684800..4102444800`; runner strings are printable ASCII `1..256`; byte ceilings are positive safe
integers; target keys are exact; unknown keys fail. `verify-evidence.ts` recomputes the Markdown
hash, verifies its final non-blank line agrees with `decision`, and supports
`--require-pass --require-ceiling-accepted`. That mode requires every check and every target field
to be `pass`, exact pins/toolchain, positive accepted ceilings, and no `INCOMPLETE` value. It also
requires one run ID/attempt, proof source HEAD, upstream tree, proof-recipe digest, epoch, and Zig
version across all rows and equality with the top-level source HEAD. Each target's tool hashes must
match the recipe's target-specific expected hashes, and runner OS/architecture must match the target
key. Operator ceiling acceptance changes only the fixed enum from `pending` to `accepted`; it adds no
identity or free-form note.

Mark `PASS` only when all four targets execute natively, all required semantics are demonstrated,
the missing-config and deletion/rename race paths are structurally write-free, the OS/libc probes
and Display-P3 vectors pass, no leakage assertion fails, the checkout remains unmodified, and the
resulting layout needs no installed Ghostty or Zig at runtime.

If the result is `FAIL`, keep the reproducible proof and name the narrow reason. Plans 066 and 067
remain blocked. The report may recommend an upstream contribution, but this plan does not authorize
a fork, patch, or alternate parser.

## Verification

Run the proof through its documented single entry point, then:

```bash
cd /Users/shaul/Desktop/D/ghostty-webgpu
git diff --check -- scripts/config-resolver-proof .github/workflows/config-resolver-proof.yml \
  docs/config-resolver-feasibility.md docs/config-resolver-feasibility.json
bun scripts/config-resolver-proof/verify-evidence.ts
git status --short
shasum -a 256 ghostty-vt.wasm bridge.wasm scripts/build-wasm.ts
git diff --exit-code -- package.json bun.lock scripts/build-wasm.ts src types \
  ghostty-vt.wasm bridge.wasm
```

Compare the hashes to Gate 0. Run format/lint checks only against proof files with non-writing
commands; do not run whole-repository formatters that could touch user-owned work.

## STOP conditions

Stop and record `FAIL` or an explicit environment blocker when:

- the pinned Config graph requires modifying/copying upstream source or a maintained fork;
- correctness requires the installed Ghostty executable, a TypeScript parser, or OS-theme guessing;
- fixed-candidate derivation cannot preserve the pinned paths and normal load order without calling
  a create-capable API;
- an existence/deletion/rename race can reach a template-creation branch;
- light and dark cannot be resolved independently, or a `null` conditional transition cannot be
  copied/deinitialized safely;
- any required semantic is accessible only through raw-path/message output;
- any target cannot be built, dependency-inspected, and executed natively;
- a target's minimum OS/libc compatibility cannot be detected before spawn in both Node and Bun;
- Display-P3 conversion cannot be frozen to deterministic constants, operation order, and vectors;
- the runtime would require Ghostty source, Zig, or an unbounded external resource installation;
- output, stderr, logs, or errors leak a sentinel; or
- either checked-in WASM file or any disallowed path changes.

## Completion checklist

- [x] Root scheduling and clean proof scope confirmed.
- [x] Exact upstream checkout and Zig pin verified; upstream diff remains empty.
- [x] Minimal build and initialization graph is documented exactly.
- [ ] Normal search, includes, themes, colors, resets, diagnostics, and palette mask are proven.
- [x] Light/dark and no-conditional ownership paths are proven.
- [x] Dynamic cursor/selection colors and surface variants are classified.
- [ ] Empty config roots remain byte-for-byte unchanged.
- [ ] Delete/rename-after-discovery races cannot create a template.
- [ ] Four targets build, execute natively, and have recorded dependencies/hashes/sizes.
- [ ] Minimum OS/libc probes and deterministic Display-P3 vectors are proven.
- [x] Privacy/leakage assertions pass.
- [x] Existing package, source, build-wasm script, and WASM assets are unchanged.
- [ ] Replacement strict JSON summary and non-writing evidence verifier agree.
- [ ] Replacement evidence report ends in exactly `Decision: PASS` or `Decision: FAIL`.
