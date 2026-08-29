# Plan 066: Package the pinned Ghostty config resolver

> **Executor instructions**: Read this plan completely, then read both repositories' `AGENTS.md`,
> root `PLAN.md`, the accepted `ghostty-webgpu/docs/config-resolver-feasibility.md` and
> `ghostty-webgpu/docs/config-resolver-feasibility.json` records, and
> `/Users/shaul/.agents/skills/never-nester/SKILL.md`. Execute milestones in order.
>
> This plan modifies only `/Users/shaul/Desktop/D/ghostty-webgpu`. Do not modify Platform. Do not
> branch, commit, push, publish, or open a PR unless explicitly asked. This plan ends with one exact,
> reviewed, **unpublished** `ghostty-webgpu-0.1.2.tgz`; integration and publication belong to Plan 067.

## Status

- **State**: Proposed — feasibility evidence accepted; root go/no-go scheduling required
- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH — native packaging, local-file privacy, subprocess cleanup, and public API
  compatibility
- **Depends on**: accepted `ghostty-webgpu/docs/config-resolver-feasibility.md` and
  `ghostty-webgpu/docs/config-resolver-feasibility.json`, verified by
  `ghostty-webgpu/scripts/config-resolver-proof/verify-evidence.ts`
- **Planned against**: `ghostty-webgpu` closeout
  `06b070b01e63d04ff0de0998276768d403bc738d`, native evidence HEAD
  `e9c198e073067d5415ac4224176db1eb076f5dbf`, package `0.1.1`, upstream Ghostty
  `c8554f28e0efe2f5595f32020371c34b25ec628f`
- **Evidence identity**: workflow `33212162580`, attempt `1`, proof-recipe SHA-256
  `40083f27ad5f925808cc48e0fdd428b4ab0515eb38dedb42b0ca2065a16e44f0`
- **Accepted package ceilings**: `darwin-arm64=2097152`, `darwin-x64=2097152`,
  `linux-arm64=8388608`, `linux-x64=9437184`, total `22020096` bytes
- **Target version**: `0.1.2`; patch only
- **Unlocks**: Plan 067 only after the exact tarball, identity, and evidence pass every gate below

## Required outcome

1. `ghostty-webgpu/config-resolver` is a host-only entry point that invokes a packaged native
   resolver built from the package's exact Ghostty pin. The browser-safe root does not import,
   export, or bundle Node APIs or native assets.
2. One package contains verified resolver artifacts for `darwin-arm64`, `darwin-x64`,
   `linux-arm64`, and `linux-x64`; Ghostty and Zig are not runtime dependencies.
3. The public resolver accepts no executable, config path, argv, environment, cwd, or browser input.
   It returns only a bounded sanitized appearance document or a fixed reason enum.
4. Missing config, unsupported host, timeout, output overflow, malformed output, and native failure
   never expose config text, paths, theme names, environment values, stderr, diagnostics, commands,
   or raw native output.
5. Asking for appearance never creates a default config or writes beneath the user's config/home
   directories.
6. Public theme inputs gain only optional `cursorText`; a private canonical renderer theme always
   contains it. Existing callers that omit it still compile and behave as before.
7. WebGPU, Canvas, the xterm facade, `TerminalSession`, and public DOM `Terminal` agree on cursor
   text. `Terminal.setAppearance(...)` is one additive atomic public mutation.
8. Existing `build:wasm`, `ghostty-vt.wasm`, and `bridge.wasm` remain independent and unchanged.
9. The final tarball is installed and tested as a consumer, its byte identity is recorded, and it
   remains unpublished until Platform passes Plan 067 against those exact bytes.

## Non-goals

- No TypeScript Ghostty parser, installed `ghostty` command, maintained fork, or build-time patch.
- No arbitrary caller-selected config file or executable.
- No Windows artifact in `0.1.2`.
- No renderer implementation of window opacity/blur; the resolver reports bounded surface values.
- No Platform edits, dependency pin, or npm publication. CI artifact upload/download occurs only
  after the operator authorizes that external action.

## Gate 0 — proof evidence, drift, and baselines

Before editing:

```bash
cd /Users/shaul/Desktop/D/ghostty-webgpu
git status --short
git rev-parse HEAD
rg -n "GHOSTTY_SOURCE_REVISION" src/core/version.ts
rg -n '"version": "0\.1\.1"' package.json
bun scripts/config-resolver-proof/verify-evidence.ts --require-pass
shasum -a 256 ghostty-vt.wasm bridge.wasm scripts/build-wasm.ts
npm view ghostty-webgpu@0.1.2 version --json
```

The registry lookup must report that `0.1.2` is unpublished. If that version exists, stop and have
the operator select a new patch version, then update Plans 066–067 consistently before editing.

Continue only when the report:

- ends with exactly `Decision: PASS` and names the same upstream revision;
- records an unpatched exact build graph and initialization/deinit sequence;
- proves normal search, includes, precedence/reset, themes, named colors, conditionals, diagnostics,
  palette-mask preservation, and the `null` conditional transition;
- proves the absent-config and delete/rename race paths are intrinsically write-free;
- freezes deterministic Display-P3 conversion vectors and pre-spawn Node/Bun OS/libc probes;
- records four native execution results, dependencies, resources, sizes, build commands, and a
  proposed size ceiling; and
- needs neither installed Ghostty nor Zig at runtime.

Before implementation, verify that the stable Markdown and strict JSON still record acceptance of
the exact ceilings in this plan. Stop for a new packaging decision if any size or ceiling changes.
Preserve user-owned changes. Reconcile ownership before editing a dirty in-scope file. Record
focused baselines:

```bash
bun scripts/config-resolver-proof/verify-evidence.ts \
  --require-pass --require-ceiling-accepted
```

Copy the accepted per-target and total byte ceilings into named integer constants in the maintained
manifest schema and verifier. Every `approvedTargetCeiling` reference below means that exact
checked-in integer, not a caller input or a value inferred from the produced artifact.

```bash
bun run test:unit -- \
  src/term/tests/session.test.ts \
  src/render/instances/tests/rows.test.ts \
  src/render/canvas/colors.test.ts \
  src/xterm/tests/options.test.ts \
  src/xterm/tests/types.test.ts
bun run test:browser -- \
  src/render/tests/text-pass.browser.test.ts \
  src/render/canvas/renderer.browser.test.ts \
  src/dom/tests/terminal-input.browser.test.ts
bun run build
bun run test:package
```

Completion is a delta from these baselines, never an assumed absolute test count.

## Exact sanitized contract

Export the types below and `resolveGhosttyConfigAppearance()` only from
`ghostty-webgpu/config-resolver`, never from `src/index.ts`:

```ts
type GhosttyConfigResolveResult =
  | { readonly status: 'ready'; readonly appearance: GhosttyConfigAppearance }
  | {
      readonly status: 'unavailable'
      readonly reason:
        | 'config-not-found'
        | 'invalid-output'
        | 'output-limit'
        | 'resolver-failed'
        | 'timeout'
        | 'unsupported-platform'
    }

declare function resolveGhosttyConfigAppearance(): Promise<GhosttyConfigResolveResult>
```

The native success payload is independently exact:

```ts
type NativeRgb = { readonly r: number; readonly g: number; readonly b: number }
type NativeColor =
  | { readonly kind: 'unset' }
  | { readonly kind: 'rgb'; readonly value: NativeRgb }
  | { readonly kind: 'cell-foreground' }
  | { readonly kind: 'cell-background' }
type NativeBlur =
  | { readonly kind: 'none' }
  | { readonly kind: 'radius'; readonly value: number }
  | { readonly kind: 'macos-glass'; readonly variant: 'clear' | 'regular' }
type NativeProfile = {
  readonly background: NativeRgb
  readonly foreground: NativeRgb
  readonly cursorColor: NativeColor
  readonly cursorText: NativeColor
  readonly selectionBackground: NativeColor
  readonly selectionForeground: NativeColor
  readonly minimumContrast: number
  readonly palette: readonly NativeRgb[]
  readonly windowColorspace: 'display-p3' | 'srgb'
  readonly surface: {
    readonly backgroundOpacity: number
    readonly backgroundOpacityCells: boolean
    readonly backgroundBlur: NativeBlur
  }
}
type NativeResolverPayload = {
  readonly nativeSchemaVersion: 1
  readonly upstreamRevision: 'c8554f28e0efe2f5595f32020371c34b25ec628f'
  readonly diagnosticCount: number
  readonly profiles: { readonly light: NativeProfile; readonly dark: NativeProfile }
}
```

The checked canonical schema artifact is
`scripts/config-resolver-native/native-protocol.schema.json`. Its SHA-256 is part of
`nativeInputsTreeSha256`; both implementations reject unknown keys and share hash-bound golden
payloads. Numeric and array bounds are the public bounds below. The helper has no unavailable JSON
variant: failure is represented only by the fixed exit protocol.

`GhosttyConfigAppearance` is recursively strict and contains exactly:

- `schemaVersion`: literal `1`;
- `upstreamRevision`: literal `c8554f28e0efe2f5595f32020371c34b25ec628f`;
- `revision`: exactly 64 lowercase hexadecimal characters;
- `diagnosticCount`: integer `0..65_535`, saturating above the maximum;
- `profiles.light` and `profiles.dark`, each containing:
  - `theme.background`, `foreground`, `cursor`, `cursorText`, `selectionBackground`, and
    `selectionForeground`;
  - `theme.minimumContrast`, a finite number in `1..21`;
  - `theme.palette`, exactly 256 RGB entries;
  - `surface.backgroundOpacity`, a finite number in `0..1`;
  - `surface.backgroundBlurRadius`, an integer in `0..255`;
  - `surface.backgroundOpacityCells`, a boolean;
  - `fidelity`: `exact | best-effort`;
  - `degradedFeatures`: a unique array of at most the eight allowed values below.

Every RGB object has exactly integer `r`, `g`, and `b` properties in `0..255`. The degradation enum
is exactly:

- `background-blur`
- `background-opacity-cells`
- `cursor-color-cell-reference`
- `cursor-text-cell-reference`
- `selection-background-cell-reference`
- `selection-foreground-cell-reference`
- `display-p3`
- `macos-glass`

Unknown keys at every depth, duplicate degradation values, non-finite values, invalid array lengths,
and revision/pin mismatches are rejected. `fidelity` is `exact` iff `degradedFeatures` is empty and
`best-effort` otherwise.

The native protocol is distinct from the public result and has no ambiguous partial-public shape.
On exit `0`, the Zig helper emits exactly one recursively strict `NativeResolverPayload`.
It emits no `status`, public `schemaVersion`, `revision`, path, error, reason, or diagnostic text.
Freeze that full native schema in Zig and TypeScript from one set of cross-language golden JSON
fixtures; unknown keys and all public bounds are rejected before projection.

The wrapper validates the native object, performs the fixed color/fallback/degradation projection,
and sorts `degradedFeatures` in the exact enum order printed above. It then builds the public object
without `revision`, recursively sorts object keys lexicographically, preserves array order,
serializes with `JSON.stringify` and no whitespace, encodes UTF-8, and computes lowercase SHA-256.
Insert that digest as `revision`, then validate the complete public schema before returning it. This
algorithm is the only revision definition and has native-input, projected-output, canonical-bytes,
and digest golden vectors shared across Zig and TypeScript.

Exit and failure mapping is exact:

- unsupported OS/architecture/ABI is detected before spawn and returns `unsupported-platform`;
- exit `0` plus one valid bounded native payload proceeds to projection;
- exit `20` plus empty stdout returns `config-not-found`; exit `20` with output is
  `invalid-output`;
- exit `21`, any other nonzero exit, a signal before wrapper termination, or spawn failure returns
  `resolver-failed`, and any stdout from that process is discarded;
- exit `0` with empty, multiple, malformed, or schema-invalid output returns `invalid-output`;
- crossing the stdout cap first returns `output-limit` and starts bounded termination; and
- crossing the deadline first returns `timeout` and starts bounded termination.

The state machine records the first terminal cause once, never changes it based on later exit/error
events, and never includes native bytes in an error or log.

Preserve Ghostty's explicit palette-entry mask until official generation completes, then serialize
all 256 final entries. Normalize `background-blur = false` to `0`, `true` to Ghostty's pinned default
radius `20`, and numeric values to their validated `u8`. Any nonzero numeric blur adds
`background-blur`. A macOS glass value emits radius `0` plus `macos-glass`; it is never presented as
ordinary CSS blur. `background-opacity-cells` is added exactly when that option is true.

Dynamic cell-relative colors cannot be represented by a global terminal theme. For cursor color,
cursor text, and both selection colors, map `cell-foreground` to the profile foreground and
`cell-background` to the profile background, and add that field's exact degradation flag. Never
label that approximation `exact`. Apply the display-P3 conversion and degradation rule frozen in
the accepted feasibility records; do not silently truncate or reinterpret its color space.

Implement the report's frozen binary64 Display-P3 transfer functions, matrices, clamp point,
operation order, and half-up 8-bit rounding literally in the wrapper. Reuse its golden vectors in
Node and Bun. When selected, convert background, foreground, every static cursor/selection RGB, and
all 256 palette entries before applying dynamic fallbacks. Always order degradation markers by the
fixed eight-member enum order above before canonicalization; discovery or field traversal order
must never change `revision`.

Match pinned native defaults when a field is unset: cursor color → profile foreground, cursor text →
profile background, selection background → profile foreground, and selection foreground → profile
background. These unset fallbacks are concrete values, not degradation markers. Add fixtures for
unset, static RGB, and both dynamic tags for every field.

## Milestone 1 — maintained native artifacts and manifest

Use the exact graph and resources proven by the accepted feasibility records. Replace proof-only
orchestration with maintained package-owned paths without modifying upstream Ghostty:

- `scripts/config-resolver-native/**` for maintained Zig source, build recipe, and fixtures;
- `scripts/config-resolver-native/build-recipe.json`, `native-inputs.json`, and their strict schemas;
- `native/config-resolver/bootstrap.json` for the temporary source-only CI state;
- `native/config-resolver/manifest.json`
- `native/config-resolver/darwin-arm64/**`
- `native/config-resolver/darwin-x64/**`
- `native/config-resolver/linux-arm64/**`
- `native/config-resolver/linux-x64/**`
- `scripts/build-config-resolver.ts`
- `scripts/verify-config-resolver-artifacts.ts`
- `.github/workflows/config-resolver.yml`
- `.github/workflows/ci.yml` for the strict bootstrap/assembled lane selection

Package `files` may include only `native/config-resolver/manifest.json` and the four target bundle
directories under `native/config-resolver/`; it must exclude the bootstrap marker, maintained Zig
source, fixtures, workflow inputs, proof files, and build caches. Tarball allowlisting and
unexpected-file rejection use that same exact packaged-native set.

The manifest is recursively strict and records its schema version, exact upstream revision, exactly
one artifact per supported target, and every executable/resource file's target-relative path,
SHA-256, byte length, and expected mode. Record per-target total bytes, minimum supported macOS
product version, and Linux ABI as either fully static (`libc: none`) or an exact libc family and
minimum version. Also record the clean `nativeBuildSourceHead`, a canonical
`nativeInputsTreeSha256` over every source/build-recipe input, and the shared `SOURCE_DATE_EPOCH`.
The later package commit may only remove the bootstrap marker and add verified generated native
bundles plus their manifest; any change to a hashed native input requires a new native build run.

Reject absolute paths, `..`, duplicate targets/files, symlinks, hash/size/mode mismatches,
unexpected files, unsupported schema versions, missing/extra targets, and totals above the accepted
feasibility ceilings. Resolve assets from the installed package URL, never cwd. Native executables
use mode `0755`; data resources are non-executable. Build macOS binaries with the accepted explicit
deployment target and verify it from Mach-O load commands. Prefer a fully static Linux artifact; if
the accepted feasibility evidence proved a dynamic libc dependency, add a Bun/Node-compatible
runtime version check and native tests on the minimum, newer, wrong-family, and too-old cases. An
incompatible or undetectable ABI returns `unsupported-platform` without spawning.

Dependency inspection is an allowlist, not a log blob. Darwin provenance records the complete
sorted `LC_LOAD_DYLIB`/weak-dylib/framework set plus the deployment load command and rejects any
undeclared entry. A static Linux record requires no `PT_INTERP` and no `DT_NEEDED`. A dynamic Linux
record contains the exact interpreter and complete sorted `DT_NEEDED` set; allow only the accepted
libc/runtime dependencies proven by the feasibility evidence and reject anything else. Manifest
verification repeats the inspection on packaged bytes, while pre-spawn checks enforce the recorded
OS/libc version.

The helper must:

- reuse exactly the accepted feasibility proof's official candidate-discovery plus intrinsically
  read-only recursive-load call graph; never call a template-capable loader after a filesystem
  preflight;
- use the pinned official Config implementation and resources;
- resolve light first, then apply the official dark conditional state;
- make an owned light-to-dark copy when `changeConditionalState` returns `null`;
- install a no-op Zig log sink;
- on exit `0`, emit exactly one bounded sanitized JSON document to stdout; on exit `20`, exit `21`,
  signal, or internal failure, emit zero stdout bytes; always emit nothing to stderr;
- use bounded exit codes without embedding paths/messages; and
- preserve official search, include, theme, reset, named-color, diagnostic, and palette semantics.

Repeat the maintained proof scripts' deletion/rename-after-discovery race suite in the helper. A
candidate that disappears before open returns exit `20`, cannot fall through to template creation,
and leaves the isolated roots unchanged. If productionizing the proof would require a
create-capable API, stop: the accepted feasibility `PASS` no longer applies.

Add explicit `build:config-resolver`, `verify:config-resolver-state`,
`verify:config-resolver-artifacts`, `build:source-only`, and `verify:source-only` scripts. The native
builder is a maintainer command. `verify:config-resolver-state` accepts exactly one of two states:

1. **bootstrap** — strict canonical `native/config-resolver/bootstrap.json` exists and the manifest
   and all target directories are absent; or
2. **assembled** — the bootstrap marker is absent and the strict manifest plus exactly four verified
   target directories exist.

The bootstrap record contains schema version `1`, package `0.1.2`, the exact upstream pin, the four
fixed targets, and `nativeInputsTreeSha256`. Exclude the marker itself from that digest to avoid a
self-reference. `build:source-only` and `verify:source-only` first require the bootstrap state and
exercise compilation and every source test/check except artifact verification, packing, prepack,
and package smoke; they emit no publishable native output. Ordinary `build`, `prepack`, full
`verify`, `verify:config-resolver-artifacts`, and package smoke require assembled state and never
regenerate native bytes or require Zig. `prepublishOnly` stays on the full assembled verifier.

Update ordinary CI to classify the strict state first and run `verify:source-only` only for a valid
bootstrap marker; run full `verify` only for assembled state and fail every mixed/empty state. This
explicit one-commit bootstrap exception keeps `nativeBuildSourceHead` green without making it
packable or publishable. Removing existing artifacts and adding an arbitrary marker must fail unless
its pin, version, target set, and recomputed native-input digest all match the clean checkout.

Author the following CI matrix, provenance, and assembly path in Milestone 1, but do not commit,
dispatch, download, or assemble yet. Milestones 2–4 must finish all source, package metadata, and
release tooling first; Milestone 5 performs the authorized native build/assembly.

The CI matrix builds and executes each target on a runner whose native OS/architecture is asserted,
inspects its runtime dependencies, verifies its manifest fragment, and emits one deterministic
POSIX `ustar` archive. Archive entries are sorted target-relative paths with uid/gid `0`, empty
owner/group names, one recorded `SOURCE_DATE_EPOCH`, no PAX headers or symlinks, executable mode
`0755`, and resource mode `0644`. Rebuilding the same target at the same source/toolchain must
produce the same archive SHA-256.

Each target also emits a recursively strict sibling `provenance.json` with this exact schema; arrays
are target-relative-path sorted and hashes are lowercase hexadecimal:

```ts
type NativeTarget = 'darwin-arm64' | 'darwin-x64' | 'linux-arm64' | 'linux-x64'
type NativeCompatibility =
  | {
      readonly os: 'darwin'
      readonly minimumProductVersion: string
      readonly deploymentLoadCommand: 'pass'
      readonly dynamicDependencies: readonly string[]
    }
  | {
      readonly os: 'linux'
      readonly libc: 'none'
      readonly interpreter: null
      readonly dynamicDependencies: readonly []
    }
  | {
      readonly os: 'linux'
      readonly libc: 'glibc' | 'musl'
      readonly minimumVersion: string
      readonly interpreter: string
      readonly dynamicDependencies: readonly string[]
    }
type NativeArtifactFile = {
  readonly role: 'executable' | 'resource'
  readonly path: string
  readonly sha256: string
  readonly bytes: number
  readonly mode: '0644' | '0755'
}
type NativeTargetRecord<T> = Readonly<Record<NativeTarget, T>>
type NativeRunner = {
  readonly os: 'darwin' | 'linux'
  readonly arch: 'arm64' | 'x64'
  readonly image: string
  readonly imageVersion: string
}
type NativeTool = { readonly name: string; readonly version: string; readonly sha256: string }
type NativeToolchain = {
  readonly zig: { readonly version: '0.16.0'; readonly sha256: string }
  readonly linker: NativeTool
  readonly strip: NativeTool
  readonly sdk:
    | {
        readonly kind: 'macos'
        readonly xcodeVersion: string
        readonly xcodeBuild: string
        readonly sdkVersion: string
        readonly sdkSettingsSha256: string
      }
    | {
        readonly kind: 'linux'
        readonly sysrootName: string
        readonly sysrootVersion: string
        readonly sysrootSha256: string
      }
  readonly buildRecipeSha256: string
}

type NativeArtifactProvenance = {
  readonly schemaVersion: 1
  readonly runId: string
  readonly runAttempt: number
  readonly nativeBuildSourceHead: string
  readonly nativeInputsTreeSha256: string
  readonly sourceTree: 'clean'
  readonly sourceDateEpoch: number
  readonly target: NativeTarget
  readonly upstreamRevision: 'c8554f28e0efe2f5595f32020371c34b25ec628f'
  readonly upstreamTreeSha256: string
  readonly runner: NativeRunner
  readonly toolchain: NativeToolchain
  readonly archive: { readonly file: string; readonly sha256: string; readonly bytes: number }
  readonly files: readonly NativeArtifactFile[]
  readonly compatibility: NativeCompatibility
  readonly checks: {
    readonly semantic: 'pass'
    readonly noWrite: 'pass'
    readonly privacy: 'pass'
    readonly relocation: 'pass'
    readonly dependencies: 'pass'
  }
}

type NativeManifestTarget = {
  readonly executablePath: string
  readonly resourcesRoot: string
  readonly totalBytes: number
  readonly files: readonly NativeArtifactFile[]
  readonly compatibility: NativeCompatibility
  readonly assemblyProvenance: NativeArtifactProvenance
  readonly assemblyProvenanceSha256: string
}
type NativeResolverManifest = {
  readonly schemaVersion: 1
  readonly upstreamRevision: 'c8554f28e0efe2f5595f32020371c34b25ec628f'
  readonly upstreamTreeSha256: string
  readonly nativeBuildSourceHead: string
  readonly nativeInputsTreeSha256: string
  readonly sourceDateEpoch: number
  readonly ceilings: {
    readonly perTargetBytes: NativeTargetRecord<number>
    readonly totalPackageBytes: number
  }
  readonly targets: NativeTargetRecord<NativeManifestTarget>
}
```

Validation bounds are fixed in both producer and assembler:

- run ID matches `^[1-9][0-9]{0,19}$`; attempt is integer `1..100`; epoch is integer
  `946684800..4102444800`;
- Git heads are 40 lowercase hex and SHA-256 values are 64 lowercase hex;
- native file count is `1..4096`; each POSIX relative path is `1..240` UTF-8 bytes, contains no empty,
  `.`, or `..` component, and is unique after slash normalization;
- file lengths are integer `0..approvedTargetCeiling`; archive length is integer
  `1..approvedTargetCeiling + 1_048_576`; the archive name is exactly
  `ghostty-config-resolver-<target>.tar`;
- runner/tool/dependency strings are printable ASCII without CR/LF/NUL, length `1..256`; dependency
  arrays are sorted, unique, and contain at most 64 entries;
- canonical dotted versions have two or three unsigned components, no leading zero, each
  `0..65535`; normalize to three components and compare lexicographically; and
- Xcode build IDs match `^[0-9]{1,4}[A-Z][0-9]{1,4}[a-z]?$`; Bun/Node/npm versions elsewhere use
  canonical SemVer without a leading `v` or build metadata.

The manifest has exactly four target keys. Each target has exactly one executable role at
`executablePath`; every resource role is beneath `resourcesRoot`; its files, compatibility, and
total are byte-for-byte/equality projections of the embedded assembly provenance. Per-target and
combined totals must not exceed the checked ceiling constants.

Use one package-wide `canonicalObjectBytes(value)`: recursively validate the exact schema, serialize
with RFC 8785 JSON Canonicalization Scheme UTF-8 bytes, and append exactly one LF. Freeze Bun/Node
vectors. Both `scripts/config-resolver-native/build-recipe.json` and `native-inputs.json` must equal
their canonical bytes and must not contain their own digest.

The strict build recipe has schema version `1`, the accepted feasibility proof-recipe SHA-256, exact
upstream repository/revision/tree digest, shared `SOURCE_DATE_EPOCH`, and exactly four target-keyed
records. Each target contains the asserted runner image/version/architecture, target triple,
optimization, complete ordered build/link/strip argv, sorted unique environment name/value pairs,
and sorted tool/external-input records. Argv/environment paths may use only the fixed tokens
`$WORK`, `$UPSTREAM`, `$OUTPUT`, `$SDK`, `$SYSROOT`, and `$RESOURCES`, resolved by the builder from
verified roots; no ambient absolute path or inherited variable is allowed.

Tool roles are exactly `zig|linker|strip|sdk-or-sysroot`; external roles are exactly
`upstream-submodule|dependency-archive|generated-resource-source|runtime-resource`. Every record has
a stable ASCII ID, version where applicable, byte length, SHA-256, and exactly one strict acquisition
variant:

- `official-download`: immutable HTTPS URL plus archive length/SHA-256;
- `git`: repository URL, 40-hex revision, and `ghostty-upstream-tree-v1` digest; or
- `runner-component`: runner image/version, normalized POSIX component path,
  `file|external-tree-v1` content kind, length/SHA-256, and for macOS the Xcode/SDK version/build plus
  `SDKSettings.json` SHA-256.

A generated input also names its sorted source-record IDs and exact generating argv. Arrays sort by
role then ID using unsigned UTF-8 bytes; environment names are unique and byte-sorted. Apply the
fixed string/path/count/version/byte/hash bounds above. Copy the measured values from the accepted
proof; a missing, mutable, floating, or free-form acquisition makes packaging stop.

Reuse the maintained proof scripts' exact `ghostty-external-tree-v1` directory digest for runner
SDK/sysroot components: sorted normalized UTF-8 `lstat` records bind relative path,
directory/regular/symlink type, permission bits, content length, and regular-content or
stored-symlink-target SHA-256; reject special files and escaping links and ignore
mtimes/uid/gid/xattrs/inodes. Reuse its frozen vectors. A runner image label
without its immutable image version and verified component digest is not an acquisition identity.

`buildRecipeSha256` is SHA-256 of the complete raw canonical `build-recipe.json`. The strict
`native-inputs.json` object has schema version `1`, the upstream pin/tree digest,
`proofRecipeSha256`, `buildRecipeSha256`, a sorted `ownedFiles` array, and the exact target-keyed
projection of all tool/external-input records. Each owned-file row is
`{ path, mode: '100644' | '100755', bytes, sha256 }`, with a normalized repository-relative UTF-8
path, and arrays are sorted by unsigned UTF-8 path bytes. Enumerate the complete native import/build
closure from the clean Git index, hash exact worktree bytes, reject symlinks/untracked inputs, and
include every maintained native source, schema, fixture, pinned revision declaration, resource
declaration, builder/verifier, lock/toolchain input, and native workflow. Dependency-closure tests
fail if the build reads a package-owned path absent from this array.

Exclude only `native-inputs.json` itself, the self-reference-safe bootstrap marker, and generated
manifest/target bundles from `ownedFiles`. `nativeInputsTreeSha256` is SHA-256 of the complete raw
canonical `native-inputs.json`; the bootstrap marker, every build provenance record, assembled
manifest, provisional/evidence/identity, and verifier all bind that same digest. Each verifier
recomputes owned-file rows from the named clean Git object and compares the external projection
byte-for-byte with the canonical recipe. Mutating a path, Git mode, byte, recipe field, acquisition,
ordering rule, or excluded-file set changes the digest or fails validation.

Compute `upstreamTreeSha256` with the maintained proof scripts' exact `ghostty-upstream-tree-v1`
algorithm: parse the NUL-delimited raw records from `git ls-tree -r -z --full-tree <pin>`, accept
only blob modes `100644|100755|120000` and gitlink mode `160000`, sort by unsigned raw pathname
bytes, and hash the version header plus length-prefixed path, mode, type, original blob length, and
raw SHA-256 of exact `git cat-file blob` bytes. Hash symlinks as their stored target blob without
dereferencing; hash a
gitlink as the decoded 20-byte pinned commit ID without traversing ambient checkout state. Require
the official checkout's `sha1` object format and reject other records. The shared frozen vectors
must prove `.git`, mtimes, ownership, and untracked/ignored caches cannot affect the digest, while a
tracked path, mode, byte, symlink target, or gitlink change does. Every build-consumed submodule,
download, generated resource, SDK, or other input outside that top-level tree is separately bound by
origin, revision-or-URL, byte length, and SHA-256 in `nativeInputsTreeSha256` and the build recipe;
an unresolved input fails the build.

The workflow uploads the tar and provenance as a pair without unpacking the tar, so artifact
transport cannot erase mode bits.

Milestone 5 uses the recorded run ID explicitly after the operator authorizes that external
download, for example:

```bash
gh run download 123456789 --repo OWNER/ghostty-webgpu \
  --dir .artifacts/config-resolver-run-123456789-attempt-2 \
  --pattern 'config-resolver-build-123456789-attempt-2-*'
bun scripts/build-config-resolver.ts --mode assemble --run-id 123456789 --run-attempt 2 \
  --input .artifacts/config-resolver-run-123456789-attempt-2
```

Assembly verifies the transport archive hash, then provenance and every file hash/mode before
extracting. Parse all tar headers first and accept only regular-file and directory typeflags; reject
hardlinks, symlinks, devices, FIFOs, sparse/PAX/GNU extension entries, duplicate normalized paths,
absolute/backslash paths, traversal, unexpected directories, and trailing data. Only after the full
archive passes may it extract into a newly created empty target directory with exclusive file
creation.

Assembly accepts exactly four targets from one run/attempt, clean `nativeBuildSourceHead`, identical
`nativeInputsTreeSha256`, upstream pin, toolchain/build-recipe identity, `SOURCE_DATE_EPOCH`, and
approved runner-image set. It rejects mixed provenance, duplicate targets, extra files, or a
dirty/uncommitted source identity. The assembled manifest embeds the four strict
assembly-provenance objects and their canonical SHA-256 values so the later release workflow can
inspect the original evidence rather than only opaque digests.

Preparing the workflow does not authorize a commit, push, dispatch, download, or artifact upload.
Milestone 5 pauses for the operator before each required external action.

The workflow is manual `workflow_dispatch` only, with fixed modes `build-native` and
`release-candidate` plus expected source-head/hash inputs that each job verifies. Set top-level
permissions to `contents: read`, grant no package/release/id-token write, use no repository secrets,
set checkout `persist-credentials: false`, pin every action to a reviewed full commit SHA, and set
bounded artifact retention. Artifact names include fixed phase, run ID, target where applicable,
**run attempt**, and content SHA; provisional and final names can never collide. The build,
rebuild, pack, smoke, and finalizer commands require the expected attempt explicitly and reject a
fragment from another attempt even when the run ID matches. Put the finalizer's final-artifact upload
behind a reviewer-protected GitHub Environment approval gate. The workflow has no
push/tag/release trigger and no npm publish or GitHub Release step. Changing an action pin, runner
image, or workflow recipe changes the native input/build-recipe digest and requires fresh evidence.
Provision Zig only from the exact official archive URL and SHA-256 recorded in the recipe; do not
delegate toolchain selection to a floating setup action.

## Milestone 2 — host-only TypeScript wrapper

Add:

- `src/config-resolver/index.ts`
- `src/config-resolver/types.ts`
- `src/config-resolver/schema.ts`
- `src/config-resolver/canonicalize.ts`
- `src/config-resolver/manifest.ts`
- `src/config-resolver/process.ts`
- focused tests/fixtures under `src/config-resolver/tests/**`

The public function accepts no options. Keep spawn, clock, platform, architecture, package-root, and
environment injection private to tests.

Process policy is fixed:

- select only `darwin|linux` × `arm64|x64` from the verified manifest, then enforce its minimum
  macOS/libc constraint before spawn; an unknown, mismatched, or too-old ABI is unsupported;
- derive executable/resources from `import.meta.url`; argv is fixed, `shell` is false, cwd is not a
  config directory, and stdin is ignored;
- construct the child environment from a reviewed allowlist only: `HOME`, `CFFIXED_USER_HOME`,
  `XDG_CONFIG_HOME`, `XDG_CONFIG_DIRS`, `XDG_DATA_HOME`, `XDG_DATA_DIRS`, `TMPDIR`, `LANG`, `LC_ALL`,
  and `LC_CTYPE` when present;
  preserve only those values needed for Ghostty's official search/decoding and never return or log
  them;
- always set `GHOSTTY_RESOURCES_DIR` to the verified package-relative resource directory after
  constructing that allowlist; inherited `GHOSTTY_RESOURCES_DIR` and all other `GHOSTTY_*` values
  cannot win;
- pipe stdout with a 128 KiB hard cap and set stderr to `ignore`;
- use a 2-second deadline;
- on timeout, overflow, or abort, send `TERM`, wait at most 250 ms, then `KILL`, wait at most another
  250 ms, and finish without allowing cleanup itself to hang;
- settle exit/error/timeout races exactly once and reap the child when the runtime permits; and
- never log or return the command, environment, stderr, native error, raw stdout, path, theme name,
  diagnostic message, or config value.

The module itself emits no logs. Every failure is reduced to the fixed unavailable reason.

Add a `./config-resolver` export with modern/legacy declarations, explicit `bun` and `node` runtime
conditions, and no browser/default fallback. Add `native` to package `files`. Never re-export it
from `.`. Prove the root/browser module graph contains no Node builtins, resolver code, manifest, or
native asset reference.

Tests cover success, all bounded failures, recursively unknown keys, every numeric boundary, exact
palette length, duplicate degradation flags, fidelity consistency, canonical hash vectors,
unsupported targets, manifest tampering, timeout, overflow, TERM→KILL escalation, exit races, and
stderr suppression. Test both an inherited conflicting `GHOSTTY_RESOURCES_DIR` and a relocated
installed package; the helper must use only the hash-verified packaged resources.

Isolated child-process fixtures must also prove:

- missing config returns `config-not-found` and leaves the fixture tree byte-for-byte unchanged;
- deleting or renaming a discovered default candidate before open still returns `config-not-found`
  and cannot enter a template-creation path;
- includes, themes, named colors, reset/precedence, conditionals, and generated palette entries
  match the accepted feasibility records;
- `dark:Afterglow,light:3024 Day` produces distinct correct profiles;
- a config without relevant conditionals copies light safely to dark;
- the installed helper works with Ghostty and Zig absent from `PATH`; and
- output/errors contain none of the fixture sentinel path, secret, theme label, or diagnostic text.

## Milestone 3 — cursor-text parity and atomic public appearance

Public input compatibility is exact:

- add only optional `cursorText?: RgbColor` to exported `RendererTheme`;
- keep `TerminalRendererTheme`, `TerminalTheme`, `TerminalAppearance.theme`, and
  `TerminalAppearance.rendererTheme` source-compatible, with `cursorText` optional in every public
  constructible shape;
- add a private `CanonicalRendererTheme` with required `cursorText` and canonicalize with
  `cursorText ?? background` at the session/renderer boundary; and
- compile-test unchanged modern and legacy callers constructing themes without `cursorText`.

Update the relevant paths under:

- `src/render/config.ts`, `src/render/instances/**`, and `src/render/canvas/**`;
- `src/term/types.ts`, `src/term/session.ts`, and session tests;
- `src/xterm/appearance.ts` and xterm option/type/browser tests;
- `src/dom/types.ts`, `src/dom/terminal.ts`, and DOM browser tests; and
- `src/index.ts` only for additive public types already owned by the browser package.

A block cursor uses canonical `cursorText`, not background, in WebGPU and Canvas. xterm
`ITheme.cursorAccent` maps to cursor text and falls back compatibly when omitted.

Add this concrete public method to `Terminal`:

```ts
setAppearance(options: TerminalAppearanceOptions): TerminalMutationResult
```

It calls `TerminalSession.setAppearance` once and applies one coherent renderer/font update. Add an
optional member with the same signature to the exported structural
`GhosttyWebGpuTerminalAppearanceApi` so existing third-party implementations remain assignable.
Existing `setTheme`, `setFont`, `setCursor`, and `setColorScheme` delegate through the same path
without changing results.

Tests prove legacy fallback under a block cursor, explicit WebGPU/Canvas/xterm cursor text, one
atomic revision/update for all supplied fields, constructor appearance before first `open`, and no
runtime/renderer/session recreation for later calls.

## Milestone 4 — metadata, docs, and regression guards

Change only the patch version from `0.1.1` to `0.1.2` in `package.json`. This package's current
`bun.lock` has no root-package version field: leave it unchanged unless a real dependency edit
requires Bun to regenerate resolution metadata, and never manufacture a lockfile version update.
Update:

- `package.json` exports/files/scripts;
- `README.md` with host-only usage, matrix, output/fidelity semantics, and the requirement that
  server bundlers externalize the subpath;
- `THIRD_PARTY_NOTICES.md` for compiled Ghostty/resources;
- `.gitignore` with `.artifacts/`;
- `scripts/package-smoke.ts`;
- `scripts/create-release-candidate.ts` plus focused tests for every Milestone 5 mode/schema; and
- the native and ordinary CI workflows.

Do not edit or refactor `scripts/build-wasm.ts`. The Gate 0 hashes of that script and both WASM files
must remain identical. The resolver build must never become a prerequisite of `build:wasm`.

Extend package smoke to install a packed artifact into a clean consumer and prove:

- modern and legacy TypeScript callers may omit `cursorText`;
- root, xterm, CSS, WASM, resolver declarations, manifest, and all target assets are present;
- the removed `GhosttyWebGpuTerminal` runtime class remains absent;
- importing the browser-safe root cannot load/resolve the host helper;
- importing `ghostty-webgpu/config-resolver` works in Node and Bun on a supported native target;
- browser-condition resolution of the host subpath fails intentionally; and
- the installed helper resolves an isolated fixture with Ghostty and Zig absent from `PATH`.

Give `scripts/package-smoke.ts` two explicit modes. Its normal maintainer mode may create a temporary
pack for general regression testing. `--tarball /absolute/existing.tgz` is release-evidence mode: it
must reject a missing/non-file input, record the input hash before and after, and never build,
regenerate native assets, invoke `npm pack`, or replace/repack the supplied file. All final release
evidence below uses only `--tarball` mode.

## Milestone 5 — exact unpublished release candidate

First complete every source, metadata, test, workflow, and release-tooling edit from Milestones 1–4
and enter the strict bootstrap state. Before generated artifacts exist, run `verify:source-only`,
which includes format, lint, typecheck, unit/browser tests, and the source-only build; artifact,
prepack, and package-smoke gates are deliberately impossible in this state. Present that tested
source-only diff and obtain explicit authorization for the first clean commit/push. That commit is
`nativeBuildSourceHead`; ordinary CI must classify the marker and pass its source-only lane. It
contains all native inputs but no newly assembled target outputs. Run the Milestone 1 matrix from
that commit, then obtain separate authorization to download and assemble the exact four artifacts
with the documented command.

After assembly, the diff from `nativeBuildSourceHead` may contain only deletion of
`native/config-resolver/bootstrap.json`, the four generated target directories, and
`native/config-resolver/manifest.json`. The assembler performs that state transition only after all
four inputs validate. If any test requires a source, recipe, workflow, package-metadata, or
release-tool fix, do not reuse the assembly: create a new authorized native-build commit and repeat
the matrix. After all full assembled-state gates below pass, present that constrained diff and obtain
authorization for the second commit. That clean commit is `packageSourceHead`; ordinary CI must pass
the full lane there.

The Milestone 4 `scripts/create-release-candidate.ts` has separate `--pack`, `--finalize`, and
read-only `--verify` modes. No mode may rebuild native assets. `--pack` must require a clean committed
source tree, record that exact package-source HEAD in the provisional record separately from the
native-build source HEAD already bound by manifest provenance, and refuse if the candidate name,
staging directory, or lock file already exists. It acquires the lock exclusively, packs once into an
empty same-filesystem staging directory, validates the npm JSON and tar contents/modes, freezes
SHA-256 and byte length, and atomically renames those bytes to
`.artifacts/ghostty-webgpu-0.1.2.tgz`. It writes only a provisional hash record; it does not write the
final identity.

The provisional record is recursively strict:

```ts
type ReleaseCandidateProvisional = {
  readonly schemaVersion: 1
  readonly runId: string
  readonly runAttempt: number
  readonly packageVersion: '0.1.2'
  readonly packageSourceHead: string
  readonly nativeBuildSourceHead: string
  readonly nativeInputsTreeSha256: string
  readonly sourceDateEpoch: number
  readonly upstreamRevision: 'c8554f28e0efe2f5595f32020371c34b25ec628f'
  readonly tarball: {
    readonly file: 'ghostty-webgpu-0.1.2.tgz'
    readonly sha256: string
    readonly bytes: number
    readonly npmShasum: string
    readonly npmIntegrity: string
  }
  readonly nativeManifestSha256: string
  readonly packedFileListSha256: string
  readonly packTools: { readonly bun: string; readonly node: string; readonly npm: string }
}
```

Apply the shared head/hash/epoch/SemVer bounds. `npmShasum` is 40 lowercase hex;
`npmIntegrity` matches `^sha512-[A-Za-z0-9+/]{86}==$`; tarball bytes are integer
`1..approvedTotalPackageCeiling`; and the packed file list has `1..8192` normalized paths under the
same 240-byte path bound. `--finalize` validates this record before any other evidence, opens the tgz
read-only, records its pre-verification hash/metadata, and requires identical hash/metadata after
all inspection and after identity generation.

### Canonical release hash preimages

Reuse the package-wide checked `canonicalObjectBytes` implementation defined for native inputs. No
BOM, CR, alternate escaping, extra whitespace, or extra final newline is permitted. Extend its
cross-runtime Bun/Node vectors with nested key order, UTF-8 strings, integer boundaries, and arrays.
Every object digest below hashes those exact bytes, even when the object is embedded as a subtree in
a larger evidence file.

The packed file-list preimage has this strict shape:

```ts
type PackedFileRecord = {
  readonly path: string
  readonly mode: '0644' | '0755'
  readonly bytes: number
  readonly sha256: string
}
type PackedFileList = {
  readonly schemaVersion: 1
  readonly files: readonly PackedFileRecord[]
}
```

Inspect the uncompressed npm tar without extracting it. Require one normalized `package/` prefix;
accept only regular files and canonical zero-length directory entries; reject every link, device,
extension, duplicate, traversal, backslash, trailing-data, or noncanonical mode case. Exclude
directories from `files`. Sort regular-file records by unsigned UTF-8 path bytes after removing the
prefix, then set `packedFileListSha256 = SHA256(canonicalObjectBytes(list))`. This same definition is
used by Plan 067 for installed-package comparison.

The remaining preimages are exact:

- `nativeManifestSha256` hashes the raw packaged `native/config-resolver/manifest.json` bytes, which
  must themselves equal `canonicalObjectBytes(parsedManifest)`;
- `provisionalSha256` hashes `canonicalObjectBytes(provisional)`, exactly the bytes of the pack job's
  provisional JSON file and reproducible from `evidence.provisional`—no fourth handoff file is
  required;
- every `assemblyProvenanceSha256`, `releaseRebuildProvenanceSha256`, and member of
  `provenanceSha256` hashes `canonicalObjectBytes` of that one strict provenance object;
- `evidence.sha256` hashes the exact evidence file bytes, which equal
  `canonicalObjectBytes(evidence)`; and
- tarball SHA-256, npm SHA-1 shasum, and npm SHA-512 integrity hash the exact untouched `.tgz` bytes.

Field order in source objects is irrelevant; the strict schema, canonicalizer, prescribed array
orders, and LF rule completely define every digest. Add mutation tests for every byte source and a
test that recomputes all identity digests solely from the three final handoff files.

Before asking for the release workflow, run the source/regression gates:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test:unit
bun run test:browser
bun run build
bun run verify:config-resolver-artifacts
bun scripts/package-smoke.ts
git diff --check
git status --short
shasum -a 256 ghostty-vt.wasm bridge.wasm scripts/build-wasm.ts
```

The ordinary package smoke above is regression evidence only. Present the generated-only diff and
native provenance to the operator. A release candidate requires the operator-authorized
`packageSourceHead` described above; do not pack an uncommitted tree. All four native
artifacts name the same earlier `nativeBuildSourceHead`, `nativeInputsTreeSha256`, build-recipe hash,
toolchain, and epoch. Verify the committed diff between those heads contains only the allowed
bootstrap-marker deletion plus generated bundles/manifest before starting the release workflow.

The authorized release workflow at `packageSourceHead` has this dependency graph:

1. four native jobs explicitly check out `nativeBuildSourceHead`, verify its clean input-tree hash,
   rebuild with the recorded toolchain/recipe/epoch, compare byte-for-byte with the corresponding
   bundle at `packageSourceHead`, reproduce the deterministic archive for their target, and upload
   that target's strict rebuild provenance as an immutable
   `release-rebuild-<run>-attempt-<attempt>-<target>-<sha>` artifact;
2. one pack job downloads and validates all four same-run provenance fragments, checks out a clean
   committed tree, runs `create-release-candidate.ts --pack` once, and uploads that exact tgz plus
   provisional record as one immutable
   `release-pack-<run>-attempt-<attempt>-<tarball-sha>` workflow artifact;
3. four downstream native smoke jobs download that same workflow artifact, verify SHA-256 before
   extraction, and run `package-smoke.ts --tarball <exact-path>` under Bun and Node on their asserted
   native OS/architecture without rebuilding or packing, each uploading
   `release-smoke-<run>-attempt-<attempt>-<target>-<sha>`; and
4. one finalizer directly downloads the untouched pack artifact, all four original rebuild-
   provenance artifacts from step 1, and all four strict smoke-provenance artifacts from step 3. It
   verifies one explicit run/attempt, package/native source identities, runner/toolchain metadata,
   archive hashes, tarball SHA-256/length, and all fixed pass results, then runs
   `create-release-candidate.ts --finalize`.

Each smoke-provenance fragment is recursively strict and has this exact shape:

```ts
type ReleaseSmokeProvenance = {
  readonly schemaVersion: 1
  readonly runId: string
  readonly runAttempt: number
  readonly target: NativeTarget
  readonly packageSourceHead: string
  readonly nativeBuildSourceHead: string
  readonly nativeInputsTreeSha256: string
  readonly packageVersion: '0.1.2'
  readonly upstreamRevision: 'c8554f28e0efe2f5595f32020371c34b25ec628f'
  readonly tarball: { readonly file: string; readonly sha256: string; readonly bytes: number }
  readonly nativeManifestSha256: string
  readonly releaseRebuildProvenanceSha256: string
  readonly runner: {
    readonly os: 'darwin' | 'linux'
    readonly arch: 'arm64' | 'x64'
    readonly image: string
    readonly imageVersion: string
  }
  readonly runtimes: { readonly bun: string; readonly node: string }
  readonly checks: {
    readonly artifactVerification: 'pass'
    readonly packageSmoke: 'pass'
    readonly nativeFixture: 'pass'
    readonly abi: 'pass'
    readonly relocation: 'pass'
    readonly privacy: 'pass'
  }
}
```

Apply the fixed run/head/hash/epoch/string/SemVer/target bounds listed under native provenance and
the fixed tarball/package ceilings from the provisional schema. Unknown keys or mixed
run/source/toolchain, tarball, manifest, runner, or result values fail finalization.

The finalizer first constructs this canonical evidence bundle in private staging:

```ts
type ReleaseCandidateEvidence = {
  readonly schemaVersion: 1
  readonly provisional: ReleaseCandidateProvisional
  readonly assembly: NativeTargetRecord<NativeArtifactProvenance>
  readonly releaseRebuild: NativeTargetRecord<NativeArtifactProvenance>
  readonly releaseSmoke: NativeTargetRecord<ReleaseSmokeProvenance>
}
```

`provisional` is the exact record emitted by the once-only pack job; its canonical SHA-256 must equal
the identity's `provisionalSha256`. `assembly` is the original manifest-embedded build run,
`releaseRebuild` is the release workflow's independent checkout/rebuild of
`nativeBuildSourceHead`, and `releaseSmoke` is the four-run exact-tarball matrix. Each record has
exactly the four target keys. Serialize with recursively sorted object keys, no whitespace, and one
trailing newline by using `canonicalObjectBytes(evidence)`. Validate all cross-record
identities/hashes before staging any output.

Only then does the finalizer construct this recursively strict identity in the same staging
directory:

```ts
type ProvenanceDigests = {
  readonly assembly: NativeTargetRecord<string>
  readonly releaseRebuild: NativeTargetRecord<string>
  readonly releaseSmoke: NativeTargetRecord<string>
}
type ReleaseCandidateIdentity = {
  readonly schemaVersion: 1
  readonly packageVersion: '0.1.2'
  readonly packageSourceHead: string
  readonly nativeBuildSourceHead: string
  readonly nativeInputsTreeSha256: string
  readonly sourceDateEpoch: number
  readonly upstreamRevision: 'c8554f28e0efe2f5595f32020371c34b25ec628f'
  readonly assemblyRun: { readonly id: string; readonly attempt: number }
  readonly releaseRun: { readonly id: string; readonly attempt: number }
  readonly tarball: {
    readonly file: 'ghostty-webgpu-0.1.2.tgz'
    readonly sha256: string
    readonly bytes: number
    readonly npmShasum: string
    readonly npmIntegrity: string
  }
  readonly nativeManifestSha256: string
  readonly packedFileListSha256: string
  readonly provisionalSha256: string
  readonly evidence: {
    readonly file: 'ghostty-webgpu-0.1.2.evidence.json'
    readonly sha256: string
    readonly bytes: number
  }
  readonly provenanceSha256: ProvenanceDigests
}
```

Apply all shared exact bounds, npm hash/integrity rules, canonical preimages, and package ceiling.
Each provenance digest is the SHA-256 of `canonicalObjectBytes` for that strict object in the
evidence file. The finalizer validates the provisional record, reopens the tgz read-only, verifies
every manifest file/hash/mode and rejects unexpected native files, then requires the input tgz's
pre/post SHA-256, length, inode identity, and mtime to remain unchanged.

Finalization is transactional and immutable. Require an explicit run ID and run attempt; acquire an
exclusive content-bound finalizer lock and require both the sibling staging directory and final
`release-final-<run>-attempt-<attempt>-<tarball-sha>` directory to be absent. Create the staging
directory on the same filesystem. Copy—not repack—the already verified tgz into it and create the
tgz, evidence, and identity with `O_EXCL`; hash and validate the staged trio, fsync every file and the
directory, then atomically rename the whole directory to the final name. No final handoff path is
visible before that single rename. Refuse retries once the final directory exists. On failure,
remove only the lock/staging paths created by that invocation and never touch the input pack
artifact or any pre-existing path. The approved uploader reads only the immutable final directory
and uploads its three files together as
`ghostty-webgpu-0.1.2-release-candidate-<run>-attempt-<attempt>-<tarball-sha256>`.

Serialize the identity as `canonicalObjectBytes(identity)`; its own hash is computed only by the
download/copy verifier and is not self-embedded.

`--verify` accepts explicit absolute `--tarball`, `--identity`, and `--evidence` paths, opens all
three read-only, performs the same recursive schema/canonical/cross-hash/tar/manifest/provenance
checks, requires four assembly/rebuild/smoke passes, and verifies pre/post file metadata. It emits
only a fixed success/failure code and never rewrites the artifacts. Before trusting itself, it also
requires its repository checkout to be clean at the identity's `packageSourceHead` and verifies its
own content against that Git object; a drifted verifier cannot certify the handoff.

After the operator authorizes download, retrieve the final workflow artifact by its explicit run ID,
run attempt, and expected tarball SHA into an empty directory. Refuse rather than overwrite if any
handoff path below already exists, then copy those exact bytes there using exclusive creation. Run
`--verify` before and after the copy. Do not run `npm pack` locally and do not accept an identity
produced before all four exact-tarball smoke jobs passed.

```bash
gh run download 987654321 --repo OWNER/ghostty-webgpu \
  --name ghostty-webgpu-0.1.2-release-candidate-987654321-attempt-2-<tarball-sha256> \
  --dir .artifacts/release-run-987654321-attempt-2
```

Hand exactly these ignored local artifacts to Plan 067:

- `.artifacts/ghostty-webgpu-0.1.2.tgz`
- `.artifacts/ghostty-webgpu-0.1.2.identity.json`
- `.artifacts/ghostty-webgpu-0.1.2.evidence.json`

```bash
bun scripts/create-release-candidate.ts --verify \
  --tarball .artifacts/ghostty-webgpu-0.1.2.tgz \
  --identity .artifacts/ghostty-webgpu-0.1.2.identity.json \
  --evidence .artifacts/ghostty-webgpu-0.1.2.evidence.json
```

Do not run `npm publish`.

## STOP conditions

Stop instead of substituting when:

- the stable feasibility Markdown/JSON is absent, not `PASS`, or names a different pin/toolchain;
- any target cannot be built, dependency-inspected, or executed as proven;
- the implementation needs an upstream patch/fork, handwritten parser, installed Ghostty, or
  installed Zig at runtime;
- official loading writes on the missing-config path;
- a delete/rename race can reach template creation;
- output/failure leaks a path, config value, theme name, environment value, stderr, diagnostic,
  command, or raw native text;
- a dynamic color is flattened without its exact degradation flag;
- the helper becomes reachable through the root/browser graph;
- compatibility requires `cursorText` in any publicly constructible shape;
- `scripts/build-wasm.ts` or either checked-in WASM hash changes;
- an artifact differs from its manifest or exceeds the accepted feasibility ceiling;
- host compatibility or packaged resources cannot be verified before spawn;
- native/release provenance mixes runs, source identities, toolchains, targets, or archive hashes;
- release packing starts from a dirty/uncommitted tree or would overwrite/repack a candidate;
- identity/evidence/provisional validation or any read-only pre/post artifact check fails;
- any tested tarball differs from the recorded release-candidate identity; or
- publication or Platform changes appear necessary during this phase.

## Completion checklist

- [ ] Stable feasibility `PASS` evidence, maintained verifier, and exact pin verified.
- [ ] Four native targets/resources are manifest-bound and natively smoke-tested.
- [ ] Four deterministic native archives share one strict clean-source provenance set.
- [ ] Resolver output is recursively strict, bounded, sanitized, and revision-verified.
- [ ] Missing config is read-only; timeout/overflow/termination are bounded.
- [ ] Root remains browser-safe; resolver is host-only.
- [ ] Public `cursorText` remains optional; private canonical theme is complete.
- [ ] WebGPU, Canvas, xterm, session, and DOM tests agree.
- [ ] `Terminal.setAppearance` is additive and atomic.
- [ ] Existing WASM source/assets are unchanged.
- [ ] Package is versioned `0.1.2`.
- [ ] Exact once-packed `.tgz` passes Bun/Node smoke on four native runners before identity finalizes.
- [ ] Final identity/evidence bind package/native heads, inputs, runs, toolchains, archives, and smoke.
- [ ] Package remains unpublished and is ready for Plan 067.
