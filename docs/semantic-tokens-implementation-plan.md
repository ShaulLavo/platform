> [!IMPORTANT]
> **STATUS: 🟢 CURRENT (written 2026-08-20, reconciled against the editor plan the same day).** Platform
> half of a two-document pair. The editor half is
> [`/Users/shaul/Desktop/D/Editor/docs/plan-semantic-tokens.md`](../../Editor/docs/plan-semantic-tokens.md);
> its **§ The contract** is normative for everything that crosses the seam, and this document **cites its
> terms as `§C1`–`§C9` and does not restate them**. An earlier draft of this file restated six of them
> under its own `C1`–`C6` numbering; the ids collided (this file's `C4` was the editor's `§C5`) and the
> restatements drifted apart from the originals. That is why the restatement is gone. Where this plan
> needs to record a platform-only _consequence_ of a term, it appears under that term's editor id and is
> marked **[Consequence]** — a consequence is not a definition and may not be read as one. This plan
> supersedes nothing; semantic tokens are substrate **S12** of
> [editor-parity-implementation-plan.md](editor-parity-implementation-plan.md) (wave E2), and this is
> that substrate's server-and-browser half.

# Semantic Tokens — Platform Implementation Plan

Getting LSP semantic tokens out of 37 real language servers, across a stdio proxy, and onto the
editor's paint surface.

---

## 0. Skeptic's preface: what this actually buys us

Two conclusions were reasonable when the editor library's only consumer was an example app with one
in-process TypeScript worker, and both are wrong here. The editor plan re-derived them itself against
the real consumer and reversed both (its _Claim 1_ and _Claim 2_). This section is the platform-side
evidence for the same reversal — the table and the byte counts are things only this side can produce.

### 0.1 "tree-sitter + shiki already deliver most of the visible colour"

False in two different sizes, and the second is much larger than the first.

Tree-sitter ships grammars for **six** language ids in this app —
`javaScript, typeScript, html, css, json, markdown` (`apps/web/src/features/editor/utils/plugins.ts:249-256`).
Shiki covers **30 more** by TextMate grammar only
(`apps/web/src/features/editor/utils/shiki-languages.ts:10-46`). The two are mutually exclusive:
tree-sitter emits highlights only when no shiki session exists (`plugins.ts:280-286`).

The real gate is `apps/web/src/features/editor/utils/file-path.ts:9-83`. An extension absent from that
table returns `null`, and `null` does not merely mean "no colour":

**`packages/lsp-plugin/src/documentSync.ts:174` is `if (!snapshot.languageId) return null`.** A document
with no language id is never opened on the language server at all. No `didOpen`, no diagnostics, no
hover, no tokens — the socket connects, `initialize` completes, and then nothing is ever sent.

So the registry's own extension list splits three ways:

| Band        | Languages                                                                                                                                                                                                                                                                   | Colour today                                                              | LSP today                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| Structural  | ts/tsx, js/jsx, html, css, json, markdown                                                                                                                                                                                                                                   | tree-sitter (or shiki)                                                    | works                                 |
| Regex-grade | rust, go, c/cpp, java, python, ruby, php, swift, kotlin, elixir, lua, dart, terraform, csharp, scala, svelte, vue, yaml, toml, sql, … (30 shiki ids)                                                                                                                        | TextMate keyword/string/comment; **no identifier resolution of any kind** | works                                 |
| Dark        | `.zig .zon` · `.typ .typc` · `.nix` · `.ml .mli` · `.clj .cljs .cljc .edn` · `.hs .lhs` · `.fs .fsi .fsx` · `.jl` · `.tex .bib` · `.gleam` · `.prisma` · `.astro` · `.pyi` · `.tfvars` · `.objc .objcpp` · `.rake .gemspec .ru` · `.c++ .h++ .hxx` · `.ksh` · `.dockerfile` | **none — plain text**                                                     | **none — no document is ever synced** |

For the middle band the server is the only thing that can tell a type from a variable. For the dark
band the server is the only source of anything at all, and it is currently unreachable.

**That last row is a live bug independent of this feature.** Fixing it is P0 below and it is cheap.

### 0.2 The superseded premise that delta "only pays when a server re-sends tokens for a large file per keystroke, which no host here has"

This host has exactly that, and it is now measured rather than argued. Full numbers in §4; the
headline, from `rust-analyzer` (1.88.0 toolchain) over stdio against a 1 653-line / 48.5 KB Rust file,
twelve keystrokes 60 ms apart, one token request after each:

| request mode                          | bytes over stdio, 12 keystrokes | per-request p50 | max    |
| ------------------------------------- | ------------------------------- | --------------- | ------ |
| `semanticTokens/full` each time       | **944 172**                     | 21 ms           | 53 ms  |
| `semanticTokens/full/delta` each time | **1 645**                       | 40 ms           | 126 ms |

**574× fewer bytes, and slightly _worse_ latency.** That second half matters as much as the first and
is the honest reason delta is a later milestone rather than the spine: rust-analyzer computes the full
token set and then diffs it, so delta buys serialization, framing, allocation and GC pressure on both
sides of the pipe — not analysis time. It also cannot be the spine because **32 of 37 servers cannot
speak it at all** (§3.4).

Where delta runs is a placement question that editor §C7 deliberately leaves to this plan, and §6.3
answers it. Nothing about that answer is a re-quotation of any de-scoping in the editor plan; §6.3
stands on the two-tab argument, which is a fact about this transport and could not have been made from
inside the editor repo.

### 0.3 Decisions this plan makes

| Question                                                             | Decision                                                                                                                                                                                            | Where                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Who builds the `textDocument.semanticTokens` capability block?       | **This plan, per `serverId`**, by calling `semanticTokensClientCapability()` — the builder the editor ships (editor M3). The editor bakes no block into `defaultClientCapabilities()` and must not. | §1 under §C3, §5 P1     |
| What makes a per-`serverId` block safe under pooling?                | Backends are pooled by `serverId \0 root`, so a block that is a pure function of `serverId` is byte-identical for every client of a given pooled backend. **We own the test.**                      | §1 under §C3, §5 P1, §9 |
| Who answers `augmentsSyntaxTokens`?                                  | **This plan, per `serverId`.** It is the only side that knows both the language and which tree-sitter/shiki grammars this web app registered.                                                       | §1 under §C3, §5 P1     |
| Who decodes the 5-tuples?                                            | **The editor's shipped `decodeSemanticTokens`** (`packages/lsp-plugin`), called by browser-side platform code. One decoder, one test suite, and it is not this repo's. Not the proxy.               | §1 under §C7, §5 P2     |
| Who supplies `scopeAliases` for a server's non-standard type names?  | **This plan's per-server table.** rust-analyzer alone ships 38+ non-standard type names.                                                                                                            | §1 under §C4, §5 P2/P3  |
| Who throttles, and with what number?                                 | **This plan.** Exactly one debounce sits on any path from an editor signal to a request; the editor names no number and P2 sets its delay to zero explicitly, so this table is the whole policy.    | §1 under §C8, §6.1      |
| Who owns per-server quirks (range support, size caps, config gates)? | **The platform's registry.** A table of server bugs does not belong in an editor library.                                                                                                           | §3                      |
| Does `full/delta` cross the WebSocket?                               | **No. Ever.** The proxy converts; the browser only ever sees a full `SemanticTokens`. This is a platform decision, not a contract term — editor §C7 permits either.                                 | §6.3                    |
| Where does the delta baseline cache live?                            | **The proxy**, keyed per backend document — because the backend is pooled across tabs and `resultId` is per-backend, not per-tab.                                                                   | §6.3                    |
| What decides token staleness?                                        | **The editor's `textVersion`** (§C5), which never leaves the browser. LSP document versions are unusable across this seam, and §2.2/§1 record why in proxy code.                                    | §1 under §C5            |
| First server?                                                        | **rust-analyzer.** Then gopls, zls, terraform-ls, clangd, typescript-language-server.                                                                                                               | §3                      |
| Does the minimap get semantic colour?                                | **No, and not later either.** Editor's closing structural limit.                                                                                                                                    | §1, last row            |

---

## 1. The contract — by reference, with platform consequences

**The definitions live in `§ The contract` of the editor plan and nowhere else.** Read them there. This
section exists so that a platform engineer working in this repo can find, under each term's own id, the
consequence that term has for a pooled stdio proxy — which is knowledge the editor plan cannot have and
does not carry.

**Everything below marked [Consequence] is downstream of a definition, not a copy of one.** If a
[Consequence] and its term ever read as if they disagree, the term wins and the consequence is the
defect.

### §C1 — What the host hands the editor

[Consequence] **The payload and the demand request are keyed by `documentId` and carry no URI, so the
`documentId` ↔ `textDocument.uri` map is ours, in both directions.** This transport is the reason the
mapping cannot be one-to-one and forgotten: backends are pooled by `serverId \0 root`
(`proxy-session.ts:822`) and one backend serves every tab in a root, so the uri is the pool's fact while
`documentId` is the editor document's. Two consequences fall out — a token response arriving after the
user switched documents is an ordinary path here rather than a theoretical one, which is what the
`documentId` branch of §C5 catches; and the controller must resolve the demand request's `documentId` to
a uri at request time rather than caching one per connection.

[Consequence] `push()` returns a verdict and this side must read every field of it. §6.3 keeps a
`resultId` in the proxy, so a controller that discards a `dropped` verdict is trusting a delta baseline
that is wrong for a reason no log records. And on the `painted` branch, `unresolvedTypeNames` is the
only signal either side has that a server's custom legend is falling on the floor — P2 feeds it
straight into the alias-coverage assertion (§5 P2) and the warning counter (§7.2). It is the thing that
would have caught 38 of rust-analyzer's 57 type names dropping silently.

[Consequence] `multilineTokenSupport` is split, and the half that is ours is the _declaration_: P1's
builder call **does not set it**, which is `false` on the wire, and P1 owns a test asserting the emitted
block does not carry it. Not setting it and setting it `false` are the same declaration to a server and
only one of them is assertable as a byte, so the absence is what this plan tests.
The _gate_ is the editor's — its builder refuses the flag until M5's multi-line criterion passes. Until
then no conformant server sends a multi-line token, so this plan tests for none against a live server;
multi-line decoding is asserted over literal 5-tuples in editor M4 and needs no capability at all.
Raising the flag afterwards is one line here.

[Consequence] `overlappingTokenSupport` is forbidden. P1's builder call does not set it and cannot —
the editor's builder offers no way to.

[Consequence] **This side sorts nothing and asserts nothing about ordering.** The editor normalises
unconditionally, and a host-side claim of "spans sorted, non-overlapping" would be an assertion about
untrusted server data that no server guarantees. An earlier draft of this file carried exactly that
claim as a code comment; it is gone and must not come back.

### §C2 — Coordinate space

[Consequence] Nothing to add, and that is worth recording: `general.positionEncodings: ['utf-16']` is
already declared (`/Users/shaul/Desktop/D/Editor/packages/lsp/src/capabilities.ts:28-30`), the proxy
does not touch it, and no server in §3's shortlist negotiates anything else. If one ever does, the
conversion is this side's problem and happens before the push.

### §C3 — Who owns the legend, and who declares the capability

**This is the term the earlier draft of this file got backwards, and the correction is the largest
change in this revision.** The earlier draft said the editor bakes a fixed block into
`defaultClientCapabilities()` and that "the platform has no knob to vary it". The editor plan's M3 will
ship a test asserting that no such block exists there — and it is right to: the editor cannot know
whether a host paints tokens, and a default there would make every server on every connection compute
tokens nobody draws.

**So the block is built here.** The editor ships the mechanism (`semanticTokensClientCapability()`, plus
`capabilities` and `clientInfo` through `LspConnectionOptions` and _both_ plugin option types — editor
M3); this plan calls it.

[Consequence] **The block is a pure function of `serverId`, and that is what makes it safe under
pooling.** `initialize` is sent **once per pooled backend** and the result is cached from whichever
client connected first (`apps/server/src/lsp/proxy-session.ts:331,354`); later clients get that cached
result replayed. For at least two servers the advertised legend is a _function of_ the declared
capability — `terraform-ls` intersects its legend with the client's `tokenTypes` array, and `ocaml-lsp`
returns no provider at all unless the client declares `formats: ["relative"]` and `requests.full`. If
the block varied per tab, per document or per viewport, the legend every tab in a root sees would depend
on which tab opened first. Keyed on `serverId` it cannot: the pool key is `serverId \0 root`, so every
client of one backend shares one `serverId` and therefore one byte-identical block. **P1 owns the test
that asserts byte-identity, and it is not decoration — it is the invariant the pooling argument rests
on.**

[Consequence] **`augmentsSyntaxTokens` is answered here, per `serverId`.** Editor §C3 hands it to the
host because the answer depends on which grammar the host registered for the language id, and this side
is the only one that knows both halves: the registry knows which extensions a `serverId` claims
(`LspServerDefinition.extensions`, `registry.ts:32-38`), and the web app knows which of those ids have a
tree-sitter grammar (`plugins.ts:249-256`) or a shiki grammar (`shiki-languages.ts:10-46`). Dark-band
servers (zls, nixd, tinymist, hls, ocaml-lsp, …) answer `false` — nothing to augment. Structural-band
servers (typescript-language-server) answer `true`. The middle band answers `true`: shiki paints
keywords and strings and the server's tokens sit over them.

[Consequence] **`dynamicRegistration` is never declared, and the builder offers no way to declare it** —
§C3 de-scopes it on both sides, so it is not a settable option (editor M3). Absent is `false` on the
wire, and `false` is the only setting that works through this proxy today: `deno`, `dart` and `tinymist`
return `None` from `initialize` when a client declares dynamic registration, expecting
`client/registerCapability` later — and the proxy answers that request `null` and never forwards it
(`proxy-session.ts:605-608`), so the registration would never reach the browser. See §11.

[Consequence] **`clientInfo.name` must never be `"Visual Studio Code"` or `"Code - OSS"`.** `zls`
branches on it and disables `full` for those two names. The editor currently sends
`{ name: '@singapor/lsp' }` (`/Users/shaul/Desktop/D/Editor/packages/lsp/src/client.ts:253`) and this
plan does not override it. Keep it that way, and assert it in P1's test so a later refactor cannot
quietly change it.

### §C4 — Who resolves a token type to a style

[Consequence] **`scopeAliases` is a platform deliverable and it is not optional here.** Editor §C4 is
explicit that the editor ships no per-server name table and that an unresolved name paints nothing.
That fall-through is correct and it is also silent, and §3's own survey is what makes the silence
expensive: rust-analyzer ships a **57-type / 22-modifier** legend of which 38+ types and 17 modifiers
are non-standard (`lifetime`, `selfKeyword`, `builtinAttribute`, `formatSpecifier`, …). Executed without
an alias table, P2 paints ~19 names and drops 38, and its exit criterion still passes because nothing
looks broken.

So: a per-`serverId` alias table lives beside the per-server quirk table, one entry per non-standard
name with the scope it maps onto, and **P2's exit criterion counts coverage rather than checking that
colour appeared** (§5). It does not need a counter of its own — §C1's push verdict reports
`unresolvedTypeNames` for exactly this, and §7.2 turns it into a warning. A name that resolves to
nothing is the common case for a new server, not an exception.

The alias table is data with a citation per row, exactly like the quirk table, and it is the one place
a server's vocabulary is written down. It never goes near the editor package.

### §C5 — Versioning

[Consequence] This is the term this transport is most likely to tempt someone into "fixing" the wrong
way, so the proxy-side evidence is recorded here, in this repo, next to the code it describes:

- `didOpen` and `didChange` have their `version` overwritten with a proxy-owned counter
  (`proxy-session.ts:474,487-489`).
- A second tab opening the same file causes a full-text `didChange` on the shared backend that the
  first tab never hears about (`:451-459` → `:520-536`).
- `publishDiagnostics` has its `version` field deleted before broadcast (`:963-969`).

`textVersion` never leaves the browser, so none of that touches it. **Do not "repair" the version
rewriting and then simplify §C5 back onto LSP versions** — the rewriting is load-bearing for document
sharing, and §C5 would still be correct after any such repair.

[Consequence] The drop branches are reachable here for transport reasons, not only for typing speed: a
cold rust-analyzer's first answer took 734 ms (§4.1) and jdtls blocks on `waitForJobs`, so a slow first
response against fast typing reaches the edit chain's limit. P2 implements the resync branch on day one
rather than treating it as a hardening pass.

### §C6 — Anchoring, and the bias pair

[Consequence] None. Entirely inside `packages/editor`; this plan neither sets nor reads the bias pair.
Recorded so a reader does not go looking for a platform half that does not exist.

### §C7 — Where decoding and the delta cache live

[Consequence] **This plan does not write a decoder.** It calls `decodeSemanticTokens(data, legend, …)`,
which the editor ships from `packages/lsp-plugin` precisely so a host driving the paint layer directly
does not reimplement the relative-cursor walk and its rejection rules (editor M4). An earlier draft of this file
specified a second decoder in browser-side platform code, and its one-line summary of the
out-of-legend rule kept the _drop_ and lost the _advance_ — which corrupts every offset after the
dropped tuple. That is the exact failure the editor's rule 2 and its single-fixture exit criterion
exist to prevent, and having two decoders is how a fleet ends up running the untested one. **The
decoder's rules and their exit criteria are editor M4's; this plan asserts only that its controller
calls that export and hands it the legend from the cached `initializeResult`.**

[Consequence] **The decoder's drops are a channel this side reads, not a silence.** The decoder returns
its per-rule drop counts beside its spans (editor M4), for the same reason `push()` returns
`unresolvedTypeNames` (§C1): a tuple the decoder refuses is a fact about a _server_ — an index outside
the legend that server itself advertised — and this side is the only one that knows which server
produced it, so the editor can count it but cannot name the culprit. **P2 is the consumer that logs
it**, per `serverId`, through the same counter as the unresolved names (§7.2). The return shape and the
rules that populate it are editor M4's and are not restated here.

[Consequence] The placement question §C7 leaves open is answered in §6.3: **the cache lives in the
proxy**, because the two invalidating events the editor cannot see — a second tab's full-text reconcile
and idle disposal of the backend — are both events the proxy raises itself. The browser therefore never
holds a `resultId` at all, which is a stronger position than the "explicit invalidation call" §C7
allows for.

### §C8 — Throttling, cancellation, and the demand signal

[Consequence] **The number is ours and there is one of it per path.** §C8 leaves the editor's demand
signal (`onRangeNeeded`) with no delay of its own and no default, so §6.1's numbers are already the only
ones on the path. P2 sets **`viewportDelayMs: 0`** explicitly anyway (in the layer's option bag, editor
M5) rather than relying on the unset case: the zero then lives in this repo's code, where a later
editor default — or a changed meaning for _unset_ — cannot quietly add a second debounce underneath a
number this plan costed. The requirement is the zero, not the spelling: if the editor renames the
option, P2 sets whatever the delay is called to zero and §6.1 is unaffected. This is what §C8's
"policy is the host's" means in practice, and the explicit `0` is what makes it true rather than nominal.

[Consequence] Cancellation works end to end on this transport and needs no server change: `abortRequest`
sends a real `$/cancelRequest`
(`/Users/shaul/Desktop/D/Editor/packages/lsp/src/client.ts:501-508`), the proxy remaps the id from
client space to backend space and forwards it (`proxy-session.ts:405-422`), and a server that honours it
abandons real work in its own process.

[Consequence] The default 3 000 ms request timeout is wrong in both directions for this workload;
§6.2 sets it per request and gives the two numbers with the measurement behind each.

### §C9 — How the host reaches the layer, and how the editor tells it to stop

[Consequence] **Disposal already covers connection death for the token path**, which is a better answer
than the one an earlier draft of this file gave. An inactive tab gets `enabled: active`
(`apps/web/src/features/editor/components/editor.tsx:68`), which disposes the contribution and closes the
socket; a torn-down connection disposes the contribution, and §C9's first signal fires. The controller
stops requesting and drops its state there. §7.1's separate problem — that a backend death is
_invisible_ and the status indicator stays green — is a diagnostics-and-status problem, and it is
handled as one.

[Consequence] **`workspace/semanticTokens/refresh` reaches the browser as a notification, and the
downgrade is this side's deliverable.** §C9 de-scopes the server→client _request_ route on both sides
and names the one route that can exist — a transport may downgrade the request into a client-bound
notification — and it leaves **what that notification is called** to this plan as a decision and a
deliverable. It is called `workspace/semanticTokens/refresh`: the same method name, re-emitted with no
`id`. That is a convention between this proxy and the browser code it serves, not anything LSP defines,
which is exactly why it has to be written down on this side; a host registers a handler for it by name.
The editor's half is the merged `notificationHandlers` pass-through (M3 part one), scheduled there with
an exit criterion; the platform half is the proxy work in P4. The browser's handler does what §C9 says
and nothing more: `clear()` on the layer it holds, then one fresh **non-delta** request. Until P4 lands,
a host invalidates from its own events in the same two steps.

An earlier draft of this file de-scoped the downgrade and built the request route instead, on the
premise that the downgrade "needs a _notification_ handler seam that neither plan owns". The editor's
merged `notificationHandlers` falsifies that premise, and it is the request route that is de-scoped on
both sides (§11). Both drafts were reconciling against the other side's superseded text; the
notification route is the one with two live halves, and it is the cheaper one because its editor half
was already scheduled.

### The structural limit, in the same words both plans use

**Semantic colour will never reach the minimap, sticky scroll or the diff panes.** Those views read
`snapshot.tokens` through `createEditorSecondaryViewProjection().syntaxColors.tokens`
(`/Users/shaul/Desktop/D/Editor/packages/editor/src/public/secondaryViews.ts:102-105`), and the
contract's paint shape puts semantic colour on a highlight layer, not into the token array. That is a
**product decision, not an implementation detail**, and it is the migration trigger if it ever becomes
unacceptable.

---

## 2. Ground truth — what exists, and three things that are broken

### 2.1 The path a token request would take today

1. `apps/web/.../use-lsp-plugin.ts:35-60` calls `GET /lsp/match` per `{rootPath, filePath}`, aborting
   the in-flight fetch. Result `{root, serverId}`. **This is where `serverId` arrives, and it arrives
   before the plugin is constructed — which is what makes a per-`serverId` capability block possible at
   all** (§1 under §C3).
2. `apps/web/.../language-server-plugin.ts:29-55` builds `createLanguageServerPlugin({ rootUri,
webSocketRoute, webSocketTransportOptions, …callbacks })` — the **narrow** factory. Today: no
   capabilities knob, no `clientInfo`, no `LspClient` handle, no document-sync filters. Editor M3 adds
   the first two to _both_ option types (its checklist says so explicitly, "because the real consumer
   uses the narrow factory") and exposes the client handle on the narrow factory as part of the same
   milestone. This plan assumes all three and cites editor M3 as where they land.
3. `apps/web/src/lib/server-sockets.ts:48-83` re-parses the URL back into query params and opens the
   socket through the Eden treaty client.
4. `apps/server/src/app.ts:193` → `apps/server/src/lsp/routes.ts:63-113`: origin auth,
   `matchLspServer`, `pool.acquire`. Messages arriving during the async open are queued and flushed
   in order.
5. `apps/server/src/lsp/proxy-session.ts` — pooled by `serverId \0 root` (`:822`), one backend per
   root shared by every tab. Requests get their id rewritten to `platform-<n>` (`:538-547`);
   responses route back to the one originating connection (`:563-575`); notifications broadcast to
   all (`:625-631`).
6. `apps/server/src/lsp/stdio-rpc.ts` — `Content-Length` framing on the child's stdin/stdout.

Everything a token request needs is in place on this side. What is missing is on the editor side and is
scheduled there: the capability and `clientInfo` pass-through and the `LspClient` handle (editor M3),
the decoder and the vocabulary (editor M4), and the paint layer itself (editor M5).

### 2.2 What already works in our favour

- `$/cancelRequest` survives the proxy with id remapping (`:405-422`). §C8's cancellation needs no
  server work.
- The proxy holds the full document text per shared document (`SharedDocument` at `:40-45`, replayed
  at `:487-488`), so a proxy-side delta cache can be validated against real text rather than trusted.
- `initializeResult` is cached and replayed (`:331,354`), so the legend reaches every tab for free
  without a second `initialize`.
- Requests are already serialized per backend through one stdin pipe, and `pendingRequests` already
  tracks method names (`:538-547`) — the hook a token-aware rewriter needs.
- `broadcastServerMessage` sends a raw string to every connection (`:629-631`), which is the fan-out
  primitive P4's refresh downgrade is built on.

### 2.3 Three live defects found while writing this plan

Each is small, each blocks a milestone below, and each is worth fixing whether or not semantic tokens
ship.

**D1 — Twelve languages never sync a document.** `file-path.ts:9-83` has no row for `.zig`, `.nix`,
`.hs`, `.ml`, `.clj`, `.typ`, `.fs`, `.jl`, `.tex`, `.gleam`, `.prisma`, `.astro`, `.pyi`, `.tfvars`,
`.dockerfile` (as an extension) and several more that the registry _does_ have servers for. The
editor's document language id comes from exactly there (`editor.tsx:78,97`), and
`documentSync.ts:174` refuses to open a document with a null language id. Result: zls, nixd, hls,
ocaml-lsp, tinymist, clojure-lsp, fsautocomplete and texlab spawn, initialize, and then sit idle
forever. `EditorSyntaxLanguageId` is `string` (`packages/editor/src/syntax/session.ts:6`), so adding
rows costs nothing structurally — but a value with no shiki grammar must be verified to degrade to
plain text rather than throw.

**D2 — The proxy's blanket `workspace/configuration → [{}]` silently disables gopls tokens.**
`proxy-session.ts:588-591` answers every configuration request with a single empty object. Measured:
with `[{}]`, gopls returns **zero** semantic tokens for both `full` and `range` while still
advertising `semanticTokensProvider: { full: true, range: true }`. With `[{ "semanticTokens": true }]`
the same request returns 3 818 tokens. A capability that is advertised and then answers empty is the
worst possible failure mode — indistinguishable from "this file has no interesting symbols".

**D3 — `rust` spawns a rustup shim that is guaranteed to die.** `registry.ts:355-360` is
`spawnCommand(['rust-analyzer'])`, resolved through `which` (`installers.ts:310`). On this machine
that resolves to `/Users/shaul/.cargo/bin/rust-analyzer`, a rustup proxy which exits with
`error: 'rust-analyzer' is not installed for the toolchain 'stable-aarch64-apple-darwin'`. The real
binary is at `~/.rustup/toolchains/<tc>/bin/rust-analyzer`. The failure surfaces as a socket close
with no explanation (`routes.ts:99-110`), because nothing in the stack reports a backend death
(§7.1). **The first milestone targets rust-analyzer and the registry cannot currently start it.**

---

## 3. Which servers, and in what order

Thirty-seven is not a milestone. Six is, and each of the six proves something none of the others do.
The ordering is by _what the seam learns_, not by user population — with the deliberate consequence
that the language most users will notice goes last.

### 3.1 The shortlist

**1. rust-analyzer — the stress test.** The only server that loads every axis at once: measured
`full: { delta: true }`, `range: true`, a **57-type / 22-modifier** legend (38+ of those types and 17
of those modifiers non-standard: `lifetime`, `selfKeyword`, `builtinAttribute`, `formatSpecifier`, …),
a separate process over stdio, and real files big enough that payload size is a number rather than a
worry. Rust already has TextMate colour, so it also isolates cleanly what semantic tokens add _on
top of_ shiki rather than instead of it. It is also the server that makes the `scopeAliases` table
(§1 under §C4) unavoidable rather than optional. **If the contract survives rust-analyzer it survives
the other 36.** Blocked on D3.

**2. gopls — the control case, and the one that finds the proxy bugs.** Measured `full: true`,
`range: true`, **delta explicitly unimplemented** (`"SemanticTokensFullDelta" not yet implemented`),
14 types / 15 modifiers where the custom axis is _modifiers_ (Go type shapes: `array`, `chan`, `map`,
`pointer`, `slice`, `struct`) rather than types. It proves three things rust-analyzer cannot:

- the **full-only** path, and therefore that delta is a branch and not the spine;
- the **modifier** half of the pipeline, which a rust-only run would fake;
- **D2 and the 100 KB cap** — see §4.2. gopls is where the proxy's configuration reply and the
  mandatory-range rule both get discovered. Better here than in production.

It also demonstrates that a `resultId` in a response means nothing: gopls returns one (a timestamp
string) and then rejects `full/delta`. Only `semanticTokensProvider.full.delta === true` may gate the
delta path.

**3. zls (Zig) — the largest user-visible payoff, and the D1 proof.** `.zig` has _no_ colour today and
no LSP at all, so semantic tokens are the entire rendering, and `augmentsSyntaxTokens` is `false` for
it. Pinned at 0.16.0 in `installer-manifest.ts:113-140` so it installs deterministically, and
`spawnZls` (`installers.ts:292-301`) already requires `zig` on PATH before downloading. Forces two
hazards early: a non-standard type (`escapeSequence`) inserted **mid-legend** rather than appended,
which breaks any decoder that assumes indices 0-22 are the standard set; and the `clientInfo.name`
branch. Requires D1 first — without a `.zig` language-id row, nothing is ever sent.

**4. terraform-ls — converts "who owns the legend" from an argument into an end-to-end test.** Its
advertised legend is literally the intersection of its own token types with the client's declared
`tokenTypes` array, so custom `hcl-*` / `terraform-*` types the client did not name are dropped and the
server stops emitting them. That makes the per-`serverId` block empirically checkable against a real
server: two tabs on one root, one legend, or the invariant is broken. Full-only, no range, no delta —
cheap in every other respect.

**5. clangd — a second delta implementation, and the hardest legend.** Present on every macOS with
Xcode CLT (measured: Apple clangd 15 at `/usr/bin/clangd`). Measured `full: { delta: true }` and —
critically — **`range: false`**. A `semanticTokens/range` request returns _method not found_. That
single fact kills any design whose viewport story is "always ask for a range", and it is why §6.1's
policy is per-server rather than universal. Its legend has duplicate names at multiple indices —
`variable` at 0, 1 and 7 and `function` at 3 and 5 — which is the decode-by-index case editor M4 owns
a test for.

**6. typescript-language-server — last, deliberately.** Highest traffic, where users notice first,
and where the contract learns the least: TypeScript is the one language whose tree-sitter grammar is
strongest, so the incremental gain is smallest and the risk of a visible regression is largest. Its
legend has non-standard `member` and `local`, and it has **no delta**, so it cannot be the vehicle for
the delta decision either. It is also the only shortlist server that answers `augmentsSyntaxTokens`
`true` against a tree-sitter grammar rather than a shiki one. Land it once the seam is settled and the
priority band has been looked at by a human against a real theme.

### 3.2 Second wave, once the seam holds

**tinymist** and **ocaml-lsp** — both delta-capable, both in the dark band (zero colour today), and
between them they exercise the `formats: ["relative"]` negotiation and the dynamic-registration branch
this plan deliberately avoids. Then **jdtls**, whose custom enum legend (`annotation`, `record`,
`recordComponent`) is easy but whose `waitForJobs` blocking behaviour makes it the real test of §6's
throttle and timeout story.

### 3.3 Explicitly not worth targeting

**pyright has no semantic token implementation** — it is a Pylance-only feature, and Python semantic
colour requires flipping `lsp.experimental.tyForPython` (`packages/contracts/src/settings/keys.ts:343`)
to reach **ty**, which does have it. **sourcekit-lsp** has handlers but never advertises the
capability. Also out: **texlab**, **gleam**, **prisma**, **julia**, **elixir-ls**, **bash**,
**yaml-ls**, and the three linters (**eslint**, **oxlint**, **biome**) — none implement it, and for
the linters it would be meaningless anyway.

One incidental defect worth carrying: `spawnBiome`'s npm fallback (`installers.ts:81-89`) installs the
package literally named `biome` — "a simple way to manage environment variables" — rather than
`@biomejs/biome`. Verified at `~/.platform/lsp/node/node_modules/biome/package.json`. Unrelated to
tokens; fix it while you are in the file.

### 3.4 The delta population

Delta-capable across the whole registry: **rust-analyzer, clangd, haskell-language-server, tinymist,
ocaml-lsp (only if the client asks)**. Five of thirty-seven. Everything else is full-only or has no
provider at all. Delta is an optional branch of §6.3, never its spine.

---

## 4. Where this gets expensive

All numbers below were measured on this machine (aarch64 macOS, 2026-08-20) by driving each server
over real stdio with `Content-Length` framing and the capability block P1 builds. Probe scripts are in
the session scratchpad; regenerate rather than trust these numbers after any server upgrade.

### 4.1 One request, one file

| Server                 | File                                  | `full`                                 | tokens | `range`, 60 lines       | `full/delta` after 1 edit | legend             |
| ---------------------- | ------------------------------------- | -------------------------------------- | ------ | ----------------------- | ------------------------- | ------------------ |
| rust-analyzer (1.88.0) | `slab/src/lib.rs`, 1 653 ln / 48.5 KB | **78 669 B**, 734 ms cold / 19 ms warm | 5 993  | 3 337 B, 243 tok, 2 ms  | **135 B**, 1 edit, 48 ms  | 57 types / 22 mods |
| gopls (v0.21.0)        | `net/http/request.go`, 50.4 KB        | **44 370 B**, 13 ms                    | 3 818  | 1 976 B, 163 tok, <1 ms | _not implemented_         | 14 / 15            |
| gopls (v0.21.0)        | `net/http/server.go`, 131.9 KB        | **error** — see §4.2                   | —      | 2 195 B, 175 tok        | _not implemented_         | 14 / 15            |
| clangd (Apple 15)      | 125.9 KB C++                          | 3 972 B †                              | 273 †  | **method not found**    | 138 B, 1 edit, 3 ms       | 21 / 14            |

† clangd's counts are low because the probe sandbox could not resolve the file's includes. The row is
there for the _shape_ — delta works, range is refused — not for the magnitudes.

Read the rust row as the design constraint: **a viewport-sized range answer is 4% of the size of a
whole-file answer and arrives in single-digit milliseconds.** Range is the default request wherever a
server offers it. That is not a delta argument; it is prior to one.

### 4.2 The gopls file-size cliff

gopls v0.21.0 rejects a whole-file token request above 100 000 bytes:

```
semantic tokens: range …/server.go too large (131896 > 100000)
```

The 60-line range request against the _same file_ succeeded. So for Go files over 100 KB, `range` is
not an optimization — it is the only thing that works, and a `full` request returns an error the user
must never see. This is exactly the kind of per-server fact that belongs in the platform's registry
and nowhere near an editor library (§0.3).

### 4.3 The typing storm

Twelve keystrokes, 60 ms apart, one token request after each, rust-analyzer, the 48.5 KB file:

| mode         | total bytes over stdio | per-request p50 | max    |
| ------------ | ---------------------- | --------------- | ------ |
| `full`       | 944 172                | 21 ms           | 53 ms  |
| `full/delta` | 1 645                  | 40 ms           | 126 ms |

Both runs were taken with indexing still settling, so treat the latency column as "same order of
magnitude" rather than as a precise ranking — the byte column is three orders of magnitude apart and
is not noise.

**What this means, stated so it is not over-claimed.** Delta does not make the server faster; it makes
it slower per request, because rust-analyzer computes the full set and then diffs. What delta removes
is ~78 KB of JSON serialization on the server, ~78 KB through a pipe, and ~78 KB of parse plus a
~30 000-element array allocation on the proxy, **per keystroke, per open Rust file**. On a machine
that is also running the user's build, that is worth removing — but it is an allocation-pressure
argument, not a latency argument, and the milestone that builds it must be gated on a measurement of
allocation pressure and not on a stopwatch.

**And it is second in line behind range.** For a server that supports both, a viewport range request
already costs 3 337 B instead of 78 669 B without any protocol state at all. Delta is for the servers
that refuse range — which is precisely clangd, and precisely the delta-capable set. That correlation
is the actual reason delta is worth building here: **the servers that will not answer a range are
disproportionately the ones that will answer a delta.**

---

## 5. Milestones

Effort letters match the house scale: S = days, M = 1–2 wk, L = 3–6 wk. Every milestone ends with
typecheck and tests green and the app usable.

> [!NOTE]
> **Execution status, 2026-08-21.** The editor half merged as
> [ShaulLavo/singapor#7](https://github.com/ShaulLavo/singapor/pull/7), which is the approval §5.0
> makes P2 onward conditional on, so **P0–P5 were all executed against it**. P5's gate was measured
> rather than assumed, and it passes — the numbers are below.
>
> |     | State                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
> | --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | P0  | **landed**              | D1, D2 and D3 all fixed. D3's premise re-verified on this machine: `which rust-analyzer` resolves to the rustup shim, which exits with `error: 'rust-analyzer' is not installed for the toolchain 'stable-aarch64-apple-darwin'`.                                                                                                                                                                                                                                                |
> | P1  | **landed**              | Capability builder, byte-identity test, negotiated-provider endpoint, `lsp.semanticTokens.negotiated` event.                                                                                                                                                                                                                                                                                                                                                                     |
> | P2  | **landed**              | Controller, decode through the editor's export, push-verdict handling, resync branch, `viewportDelayMs: 0`.                                                                                                                                                                                                                                                                                                                                                                      |
> | P3  | **landed**              | All six shortlist servers **measured against the real binary** — the three that were not installed were installed through the app's own installers and probed. rust-analyzer 57 types / 22 mods; gopls 14/15, `full: true` so no delta; clangd 21/14, `range: false`, duplicate names at several indices; zls 28/13 with `escapeSequence` inserted **mid-legend at index 19**; terraform-ls 9/1; typescript-language-server 12/6. Every count is pinned by the conformance test. |
> | P4  | **landed**              | Refresh downgrade, backend-death reason, language change through layer replacement — plus the `workspace.semanticTokens.refreshSupport` declaration without which none of it was reachable.                                                                                                                                                                                                                                                                                      |
> | P5  | **landed, gate passed** | Proxy-side delta cache, method rewrite, reassembly, one retry on a rejected `previousResultId`, per-uri serialization, invalidation.                                                                                                                                                                                                                                                                                                                                             |
>
> **P5's gate, measured.** rust-analyzer 1.88.0 against `hashbrown-0.15.5/src/map.rs` — a real
> published crate, 6 584 lines / 197 KB / 11 978 tokens — twelve keystrokes 60 ms apart, one token
> request after each:
>
> | mode                   | bytes over stdio | `JSON.parse` | heap delta | p50   | max   |
> | ---------------------- | ---------------- | ------------ | ---------- | ----- | ----- |
> | `full` each time       | **1 603 115**    | 14.1 ms      | 9.0 MB     | 42 ms | 43 ms |
> | `full/delta` each time | **1 911**        | 0.1 ms       | 2.0 MB     | 42 ms | 42 ms |
>
> **839×, and the gate does not turn on that number.** It asks whether whole-file answers per
> keystroke _measurably_ raise allocation pressure or main-thread parse time. They do: **1.17 ms of
> main-thread `JSON.parse` per keystroke** and roughly **580 KB of garbage per keystroke**, per open
> Rust file, on a machine also running the user's build. Latency is unchanged in both directions —
> rust-analyzer computes the full set and then diffs it — so this is an allocation-and-parse
> argument exactly as §4.3 predicted, and it is stated that way rather than as a speed claim.
>
> The reassembly is verified against reality rather than against a fixture:
> `apps/server/src/lsp/tests/semantic-token-delta.test.ts` drives a real rust-analyzer through the
> real proxy, asserts a `full/delta` carrying a `previousResultId` actually went out, and asserts the
> reassembled array is **identical to what a fresh whole-file request returns for the same text** —
> the one failure mode that would otherwise be silent. It also asserts no `edits` ever reach the
> client socket.
>
> **Two corrections to this document's own text**, both found by executing it:
>
> 1. §6.2's note that `RequestOptions` is not exported from `packages/lsp` is **superseded** — editor
>    M3 exports it as `LspRequestOptions`. The controller still passes the object literally, so
>    nothing depended on the note.
> 2. §5 P1 says P2's controller reads the negotiated provider from the `/lsp/match` extension. It
>    does not: it reads `client.serverCapabilities`, which the proxy fed from the _same_ cached
>    `initialize` result. Same bytes, no second round trip, and no race against the connection the
>    answer describes. The endpoint still ships, for the developer-visibility half of P1's exit
>    criterion, and reports `negotiated: null` honestly when no backend has initialized yet.
>
> **Review.** An adversarial pass over the finished code — six lenses, every finding handed to an
> independent verifier told to refute it — surfaced eight distinct defects that survived refutation,
> all fixed, each with a test that fails on the pre-fix tree:
>
> |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
> | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `high`   | Demand-less pushes (resync, refresh) stamped the payload with `LspDocument.version` — the browser workspace's own counter — instead of the editor's `textVersion`. The two can never agree, so every such push was dropped, which raised `onResyncRequired`, which re-asked with the same wrong number: an unbounded request loop against a real child process, with the file left uncoloured. The comment above the line said "never the LSP document version". |
> | `high`   | The first demand fires before `initialize` has answered, and the layer never repeats a question — its demand signal is deduplicated on `documentId:textVersion:start:end`. So a freshly opened file stayed uncoloured until it was scrolled or typed into. Fixed by retrying from `onConnected`.                                                                                                                                                                 |
> | `high`   | `workspace.semanticTokens.refreshSupport` was never declared, and a conformant server only sends the refresh request to a client that asks for it. P4's whole downgrade route was unreachable.                                                                                                                                                                                                                                                                   |
> | `high`   | `rustup which` runs from the project root so a crate's `rust-toolchain.toml` is honoured — and that file ships inside a cloned repository. A repo naming an uninstalled toolchain made opening one `.rs` file download it. Now `RUSTUP_AUTO_INSTALL=0`.                                                                                                                                                                                                          |
> | `medium` | An unresolved `workspace/configuration` section answered with the **whole** settings tree rather than `{}`, telling a server asking about itself what another server was configured with. Found only because tightening a `toMatchObject` — where `{}` as an expected array element matches any object — turned an unfalsifiable assertion into a real one.                                                                                                      |
> | `medium` | `maxFullRequestBytes` was compared against UTF-16 code units; the cap is a byte count, so a file of non-ASCII text passed a limit the server then enforced itself.                                                                                                                                                                                                                                                                                               |
> | `medium` | A refresh on an over-cap Go file cleared the layer and then issued no request at all, leaving the file blank until the user scrolled.                                                                                                                                                                                                                                                                                                                            |
> | `medium` | The resync answer was immediate and uncapped, so any drop a fresh request could not fix was a loop. Now bounded.                                                                                                                                                                                                                                                                                                                                                 |
>
> **`lsp.semanticTokens.delta` was removed and then re-added.** The review caught it registered with
> no consumer while P5 was unbuilt, which is exactly what the settings rule forbids — _"a knob that
> writes a file nothing reads is worse than no knob."_ It came back in the same pass that wired the
> proxy's delta branch, which is the sequencing the rule actually asks for.
>
> **One more defect found while building P5.** Serializing token requests per uri means several tabs
> wait on one backend request, and `pending.connection` names only whichever asked first — so the
> first tab to close would have cancelled the answer for every other tab still waiting. Waiters are
> now dropped individually and the request is cancelled only when the last one leaves.
>
> **P5 got its own adversarial review**, because it landed after the first one and is the only part
> of this feature whose failure mode is silent-and-wrong rather than loud-and-absent. Fifteen findings
> survived refutation, collapsing to six root causes — all fixed, all pinned:
>
> |          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
> | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `high`   | **A client cancel was read as a rejected baseline.** The browser cancels its in-flight token request on _every keystroke_, and `forwardCancelNotification` left the pending entry alive — so `-32800 RequestCancelled` reached the delta path, which threw away a good baseline, counted a rejection against the server, logged a false warning, and re-issued a whole-file request the client had just abandoned. The counter it poisoned is the one §6.3 says should decide whether a server is dropped from the delta set. |
> | `high`   | **The same cancel killed the shared request for everyone.** A coalesced token request has many waiters on one backend id. `dropSemanticTokenWaiter` was written to prevent exactly this on the teardown path — and the explicit-cancel path, which is the one clients actually take, went straight past it.                                                                                                                                                                                                                   |
> | `high`   | **`releaseDocumentOwner` forgot the in-flight request instead of retiring it**, so a `didClose` could leave a live request whose answer re-seeded a baseline for a closed document, while a second request ran alongside it. Two concurrent requests for one uri is the thing serialization exists to prevent.                                                                                                                                                                                                                |
> | `high`   | **A delta was spliced into whatever baseline the map held at response time.** The request never recorded which baseline it was computed against. Reachable: an edit while a request is in flight starts a second, and the second can land first.                                                                                                                                                                                                                                                                              |
> | `medium` | **A later request coalesced across a `didChange`**, handing a tab tokens for text the user had already replaced. Coalescing is justified by three tabs showing _the same content_, not by requests straddling an edit.                                                                                                                                                                                                                                                                                                        |
> | `medium` | **Edit bounds were checked against the growing array.** Every offset in a `SemanticTokensDelta` indexes the array the server diffed against, so an edit that only fits because an earlier splice had grown the array was being accepted. Bounds are now checked against the baseline, and overlapping edits refused.                                                                                                                                                                                                          |
>
> **One deliberate departure from P2's exit criterion.** It asks that `unresolvedTypeNames` be
> asserted empty for every name in rust-analyzer's legend. It is not empty, and making it empty would
> be the wrong move: ~20 of the 38 non-standard names are punctuation and operator families
> (`comma`, `semicolon`, `arithmetic`, …) that the grammar already paints identically. Aliasing them
> would roughly double the painted span count to reproduce colour that is already on screen. They are
> declined explicitly instead, with a machine-readable reason each — which is the escape hatch §9's
> alias-coverage bullet already allows ("or that every name in it appears in an explicit
> known-uncovered list with a reason"), and the coverage test asserts the list is exhaustive **and**
> that no entry on it has silently started resolving.

### 5.0 What this side waits on, stated once

The earlier draft of this file labelled P1 "blocked on the editor's C1" and labelled P2 blocked on
nothing. That was wrong by two milestones, and the correction changes how the two repos can be
staffed:

| Milestone | Editor prerequisite                                     | Why                                                                                                                                                                    |
| --------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0        | none                                                    | Three defects in this repo, all pre-existing.                                                                                                                          |
| P1        | **editor M3**                                           | `semanticTokensClientCapability()`, `capabilities`/`clientInfo` through the narrow factory, and the `LspClient` handle.                                                |
| P2        | **editor M3 + M4 + M5**                                 | M4 ships `decodeSemanticTokens` and the token-type vocabulary; M5 creates the `SemanticTokenLayer` this side pushes onto and fires `onRangeNeeded`/`onResyncRequired`. |
| P3        | P2                                                      | —                                                                                                                                                                      |
| P4        | **editor M3** (part one, merged `notificationHandlers`) | The refresh route, as a notification (§1 under §C9).                                                                                                                   |
| P5        | P3                                                      | —                                                                                                                                                                      |

**Editor M0–M3 are unconditional; M4 and M5 are conditional on a human approving the feature**
(the editor plan's _Verdict, up front_). So: P0 and P1 can be executed in parallel with the editor's
unconditional work, and **everything from P2 onward is blocked until that approval is given.** If it is
declined, this plan stops after P1 with a diagnostic surface and no paint — which is a coherent place to
stop, and P0's three fixes stand on their own.

### P0 — Unblock the three defects (`S`)

Nothing here is semantic-token work; all three block it.

- **D1**: add the missing extension → language-id rows to `file-path.ts`. Start with `.zig`/`.zon`
  since P3 needs them. Verify a language id with no shiki grammar degrades to plain text rather than
  throwing in `createEditorShikiHighlighterPlugin` (`plugins.ts:287-334`). Extend
  `apps/web/src/features/editor/utils/tests/file-path.test.ts` with one case per new row.
- **D2**: replace the blanket `workspace/configuration → [{}]` (`proxy-session.ts:588-591`) with a
  per-server configuration reply sourced from the registry, analogous to the existing
  `initializationOptions` hook (`registry.ts:37`, applied at `proxy-session.ts:373,377-385`). gopls gets
  `{ semanticTokens: true }`. Honour the request's `items[].section` — the current code ignores it
  and returns one object regardless of how many sections were asked for, which is already wrong.
- **D3**: make the `rust` definition resolve a real binary — prefer `rustup which --toolchain stable
rust-analyzer`, fall back to `~/.rustup/toolchains/*/bin/rust-analyzer`, then PATH, and reject a
  resolved path that is the rustup shim. A dead child on spawn currently produces a bare socket close
  with no message (§7.1).

**Exit:** a `.zig` file opens a zls session that receives `didOpen`; gopls answers a range request with
non-zero tokens; a Rust file opens a rust-analyzer session that answers `initialize`.

### P1 — Build the capability block, prove it is constant per backend, and make the negotiation visible (`S`, needs editor M3)

This milestone is the feature's on-switch, and the earlier draft of this document did not contain it —
each plan assumed the other built the block. It is built here.

- **`semanticTokensCapabilityForServer(serverId)`**, a new module under
  `apps/web/src/features/editor/lsp/`. It calls the editor's `semanticTokensClientCapability()` and
  returns a `ClientCapabilities` fragment. **Its only input is `serverId`** — not the document, not the
  root, not the viewport, not a setting read at call time. That single-argument signature is the
  invariant, expressed in the type system, and the reason for it is §1 under §C3.
  - `requests`: `{ full: { delta: <per-server> }, range: <per-server> }` from the registry's table.
  - `tokenTypes` / `tokenModifiers`: the standard LSP lists. terraform-ls intersects against this, so
    it is the one field whose contents a server can observe.
  - `formats: ['relative']` — required by ocaml-lsp, harmless everywhere else.
  - `augmentsSyntaxTokens`: per `serverId`, per §1 under §C3.
  - `multilineTokenSupport`: **not set**, which is `false` on the wire, until the editor's M5
    multi-line criterion passes; raising it afterwards is one line here.
  - `overlappingTokenSupport`: not set; the builder offers no way to.
  - `dynamicRegistration`: not set; the builder offers no way to, and absent is the `false` this proxy
    needs (§1 under §C3).
- **Pass it, plus `clientInfo`, through the narrow factory.** `language-server-plugin.ts:29-55` gains
  `capabilities` and `clientInfo`; `use-lsp-plugin.ts:35-60` already has the `serverId` (§2.1 step 1) and
  is where the call happens.
- **Take the `LspClient` handle** the same factory now exposes (editor M3) and hold it for P2. Nothing
  in P1 issues a token request; it only proves the handle arrives.
- **Extend `GET /lsp/match`** (`routes.ts:21-41`) — or add a sibling endpoint — to report the matched
  server's `semanticTokensProvider` once the backend has initialized: `{ full, range, delta,
legend: { tokenTypes, tokenModifiers } }`. The proxy already holds it in the cached
  `initializeResult` (`:354`). This is what P2's controller reads to choose a request method, and what a
  developer reads to find out why a language is uncoloured.
- **Add an observability event** on the same data: `lsp.semanticTokens.negotiated` with `serverId`,
  `full`, `range`, `delta`, `typeCount`, `modifierCount`. Every one of §3's per-server facts changes
  when a server updates, and the only defence is that the negotiated result is logged at the point of
  decision.

**Exit:** `semanticTokensCapabilityForServer` is byte-identical across two independently constructed
plugins for the same `serverId` and different documents — `JSON.stringify` compared, asserted for every
`serverId` in the table plus the default (§9). The emitted block carries no `multilineTokenSupport`, no
`overlappingTokenSupport` and no `dynamicRegistration`, asserted as absences rather than as `false`
values. `clientInfo.name` is neither `"Visual Studio Code"` nor
`"Code - OSS"`, asserted. For each of the six shortlist servers the negotiated provider is visible
without attaching a debugger, and matches §4.1's table or the table is wrong and gets corrected.

### P2 — The browser-side controller: request, decode, resolve, push — one server, no delta (`M`, needs editor M3 + M4 + M5)

New: `apps/web/src/features/editor/lsp/semantic-tokens-controller.ts`, registered through the editor's
plugin so it has a view contribution (viewport, snapshot, disposal), holding the `LspClient` from P1 and
the `SemanticTokenLayer` the editor's plugin creates and hands over (editor M5). Model it on the
editor's own `packages/lsp-plugin/src/documentHighlightController.ts` — options bag, debounce with
`cancel()` on every input, capability gate, per-request `AbortController`, and a three-part staleness
check (request id / disposed / active-document identity). That controller is 137 lines and is the house
shape; do not invent a second one. **Do not copy its update-kind filter**, which is a question about the
caret (editor §C8 says the same thing).

**There is nothing to reuse and that is now explicit on both sides.** The editor's contract preamble
states that it ships no `SemanticTokensController` — one request-side artifact only, the decoder — so
the request side is the host's own code by construction, not by a choice this plan made. That is the
right split anyway: every decision this controller makes (method choice, size caps, per-server aliases,
the throttle numbers) is registry data that lives in this repo.

Responsibilities, all of them platform-side:

1. **Method choice** from P1's negotiated data plus the registry's per-server table: `range` when
   offered; `full` otherwise; **`full` refused outright for Go files over 100 KB** (§4.2).
2. **Viewport slicing.** Take the offset window from the editor's `onRangeNeeded` payload — do not
   recompute it from `snapshot.visibleRows`, and do not also listen to the contribution's `'viewport'`
   update kind. One demand path (§6.1), padded by a fixed number of rows above and below so a small
   scroll does not re-request.
3. **Decode** by calling the editor's `decodeSemanticTokens(data, legend, …)` export with the legend
   from the cached `initializeResult`. **Do not write a walk here** (§1 under §C7). Read the per-rule
   drop counts it returns beside the spans and feed them into the same per-`serverId` counter as
   `unresolvedTypeNames` — a dropped tuple is the server disagreeing with the legend it advertised, and
   §7.2 is where it surfaces.
4. **Resolve custom names** by handing the layer the per-`serverId` `scopeAliases` table (§1 under §C4).
   rust-analyzer's 38+ non-standard type names get rows in this milestone; a name with no row and no
   theme rule paints nothing and is counted (§7.2).
5. **Push** `{ documentId, textVersion, spans }` (§C1), where `textVersion` is the value captured at
   send time (§C5), and **read the returned verdict**. On a `dropped` verdict, do what §C9 says: no
   retry loop, wait for `onResyncRequired`. On a `painted` verdict, feed `unresolvedTypeNames` into the
   per-`serverId` warning counter — that field is the coverage signal this milestone's exit criterion
   is measured on.
6. **Implement the resync branch** (§C9 signal 2): discard any cached state, issue a full non-delta
   request. This is not a hardening pass to be deferred — see §1 under §C5 for why it is reachable on
   day one here.
7. **Set `viewportDelayMs: 0`** on the layer options, so §6.1's numbers are the only debounce in the
   path (§1 under §C8).

Scope: **rust-analyzer only.** One server, one language, full and range, no delta, no refresh.

**Exit:** open a Rust file, see semantic colour over shiki's; scroll, see it follow; type, see it
survive the request window; close the tab, see the colour go with the disposed layer (§C9 signal 1 —
disposal, not a `clear()` call). **Coverage, not vibes:** over a real Rust file, `push()`'s
`unresolvedTypeNames` is asserted **empty** for every name in rust-analyzer's
advertised legend, and `paintedSpans` is asserted against the decoded span count with the difference
recorded in this file — the assertion that would have caught 38 of 57 types silently dropping. A test
drives a `dropped` push verdict and asserts the controller does not re-request until `onResyncRequired`
fires.

### P3 — The other five servers (`M`)

gopls, zls, terraform-ls, clangd, typescript-language-server, in that order, each landing as a row in
the registry's per-server table, a row in the `scopeAliases` table for its non-standard names, and an
`augmentsSyntaxTokens` answer:

- **gopls** — the size cap, and D2's configuration reply proven end to end. Its custom axis is
  _modifiers_, so it is where the modifier half gets real data.
- **zls** — first language whose colour is _entirely_ semantic; mid-legend non-standard type;
  `augmentsSyntaxTokens: false`.
- **terraform-ls** — two tabs, one root, one legend: the per-`serverId` invariant proven against a
  server that actually intersects.
- **clangd** — `range: false`, so the viewport story falls back to whole-file and the payload numbers
  get real. This is the milestone that makes P5 worth doing.
- **typescript-language-server** — last, behind a settings flag until a human has looked at it against
  a real theme (§8).

**Exit:** each server's row in §4.1 reproduced by an integration test that spawns the real binary and
skips cleanly when it is absent. Each server's advertised legend has full alias coverage or the
uncovered names are listed in this file with a reason.

### P4 — Refresh, restart, and language change (`S`, needs editor M3 part one)

- **`workspace/semanticTokens/refresh`, downgraded to a notification.** The editor's half is the merged
  `notificationHandlers` pass-through (M3 part one), scheduled there with an exit criterion; this is the
  platform half. `handleServerRequest` (`proxy-session.ts:587-612`) gains a case that (a) answers the
  server `null` itself, because _N_ pooled clients cannot answer one request id, and (b) re-emits the
  method to every connection through `broadcastServerMessage` (`:629-631`) as a **notification** — same
  method name, no `id`, nothing for a browser to answer. Each browser's handler does §C9's two steps:
  `clear()` on the layer it holds, then one fresh non-delta request.
- **Why a downgrade rather than forwarding the request — and the hazard that keeps it that way.**
  `routeClientMessage` (`:297-303`) dispatches client requests and notifications and then falls through
  to `this.writeToServer(encoded)` for everything else, so a client _response_ would be forwarded to the
  backend verbatim with an unremapped id. That path is dead only because nothing ever asks a browser to
  respond: this proxy forwards no inbound server request, and the editor's client answers every one with
  method-not-found without being asked
  (`/Users/shaul/Desktop/D/Editor/packages/lsp/src/client.ts:483-490`) — which is also why §C9 de-scopes
  the request route on both sides. A notification has no id and draws no response, so it leaves the
  fall-through dead. **The regression test is that the refresh case emits notifications and that no
  inbound server request is forwarded to any connection** (§9). Anything that later forwards one must
  fix the fall-through first, in the same change.
- **Backend death:** the proxy's `closeFromProcess` (`:675-684`) already closes every client socket, and
  §C9's disposal signal already clears the layer through the contribution's own teardown. What is
  missing is the _reason_ — give the close one and surface it (§7.1) so the status indicator stops
  saying `'ready'`.
- **Language change on the same URI:** `DocumentSync` already closes and reopens when
  `active.languageId !== descriptor.languageId` (`documentSync.ts:101`). The old language's spans cannot
  survive into the new one and the controller does not clear them: a language change disposes the
  contribution and the layer with it (§C9 signal 1), and a _new_ layer arrives through
  `onLayer(layer, {documentId, languageId})` (editor M5). What the controller must do is drop the
  disposed layer and the per-document state hanging off it, then re-derive the per-server data — legend,
  aliases, method choice — from the new `languageId`, which may resolve to a different `serverId`
  entirely. **Calling `clear()` on a layer that has already been disposed is dead code, not a
  safeguard.**
- **Idle disposal** (`:660-666`, `lsp.idleTimeoutMs`, default 120 s): the proxy's delta cache dies with
  the session. That is correct — the server's own cache dies too — but the first request after a
  re-spawn must not send a stale `previousResultId`.

### P5 — Delta, in the proxy (`M`, gated)

Do not start until P3's clangd row exists and §4.3's measurement has been repeated against a real
workspace. Design in §6.3.

**Gate:** delta ships only if, on a real repository, `full`-per-keystroke measurably raises allocation
pressure or main-thread parse time in the browser or the server. If it does not, the 574× is a
number in a table and nothing more, and this milestone stays unbuilt. Say so in the commit either way.

---

## 6. Throttling, cancellation, and lifecycle against a real process

### 6.1 Request policy, per trigger

The editor gives this side two signals and a set of view-contribution update kinds. It gives no policy
and no numbers — §C8 names no milliseconds and its delay has no default, and P2 sets that delay to `0`
explicitly so it stays that way (§1 under §C8). These are the numbers.

| Trigger                            | Where it comes from                                       | debounce            | request                                                      | in-flight policy                                                                                                              |
| ---------------------------------- | --------------------------------------------------------- | ------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Document opened or switched        | a new layer through `onLayer` (§C9)                       | 0 (immediate)       | range if offered, else full                                  | cancel any in-flight and drop the old layer's reference — it was disposed with its contribution, so there is nothing to clear |
| Content edited                     | contribution `'content'` update                           | **250 ms** trailing | range if offered, else full                                  | cancel in-flight on each new keystroke                                                                                        |
| Viewport demand                    | editor's `onRangeNeeded` (§C8)                            | **100 ms** trailing | range only; **no request at all if the server has no range** | cancel in-flight                                                                                                              |
| Resync                             | editor's `onResyncRequired` (§C9)                         | 0 (immediate)       | **full, non-delta**; any `previousResultId` discarded        | cancel in-flight                                                                                                              |
| `workspace/semanticTokens/refresh` | proxy notification → the host's notification handler (P4) | 250 ms trailing     | `clear()`, then as _content edited_                          | cancel in-flight                                                                                                              |

Four notes:

- **One debounce per path, and it is this table's.** The editor's demand signal carries a host-supplied
  delay with no default (§C8), so these are already the only numbers on the path. P2 sets
  `viewportDelayMs: 0` regardless, so the zero is written down on this side instead of inherited from an
  unset option — a second delay arriving underneath the 100 ms row would be a latency neither document
  budgets and a policy this side costed but could never reach. **If a future reader finds two numbers on
  one path, that is the defect.**
- **Why 100 ms, from the numbers in §4.** `'viewport'` fires once per scroll event, un-throttled, so a
  flick-scroll issues one demand per scroll event to a _real process_. 100 ms trailing bounds that at 10
  requests/second; at the measured warm range cost of 2 ms (rust-analyzer) to under 1 ms (gopls) per
  answer, that is under 2% of one core in the server and a payload of ~3 KB rather than ~78 KB. The
  number is a rate limit on request _count_, not on bytes, which is why it does not move with file size.
  Re-derive it if the shortlist ever gains a server whose warm range answer is not single-digit
  milliseconds.
- **A server with no `range` must not re-request on scroll at all.** For clangd the whole-file answer
  already covers every viewport, so scrolling needs no new request. Treating viewport demand as a
  request trigger for a full-only server converts a 78 KB payload into a per-scroll-event 78 KB payload,
  which is the worst thing this plan could accidentally build.
- **One in-flight token request per document.** Not per connection — a second document in the same
  tab is a different request. The cancel is a real `$/cancelRequest` (§1 under §C8).

### 6.2 Timeouts

The editor's default request timeout is 3 000 ms
(`/Users/shaul/Desktop/D/Editor/packages/lsp/src/client.ts:86`). That is wrong for this workload in
both directions, and this side must set it per request rather than per connection —
`LanguageServerPluginOptions.timeoutMs` (`packages/lsp-plugin/src/types.ts:46-62`) applies to every
request on the connection, so raising it globally would make completion feel dead on a hung server.

Because this side issues token requests through the `LspClient` handle (editor M3), it sets
`timeoutMs` per request (`client.ts:61`, applied at `:380`). **Note for the executing agent:** the
`RequestOptions` _type_ is not exported from `packages/lsp` (`client.ts:61` declares it without
`export`), while `request` and `requestHandle` are public and accept it. Pass the object literally; do
not try to import the type.

- **First request after connect: 30 000 ms.** A cold rust-analyzer answering before indexing completes
  took 734 ms against a one-file crate; a real workspace's first answer is bounded by cargo metadata
  and indexing, not by the token computation. jdtls blocks on `waitForJobs` and is worse.
- **Steady state: 5 000 ms.** A warm answer is 20–50 ms (§4.1). Anything past 5 s means the server is
  wedged and the right response is to drop the layer, not to wait.
- A timeout is not an error the user sees (§7.2). It clears the pending state and lets the next
  trigger retry.

### 6.3 Delta, and why it belongs in the proxy (P5)

Editor §C7 leaves this placement open and names the constraint: whoever holds the cache must be able to
observe every event that invalidates it. On this transport that rules the browser out.

The tempting design is a per-tab `previousResultId` in the browser. **It is incorrect here**, for a
reason that only shows up with two tabs:

- The backend is pooled by `serverId \0 root` (`:822`) and shared across every tab in that root.
- A server's semantic-token cache is keyed by the `resultId` _it_ last issued for a document — one
  per document, not one per client.
- So if tab A sends `full/delta` with its `previousResultId`, the server replaces its baseline. Tab B's
  stored `previousResultId` is now stale, and its next delta request either errors or — worse, on a
  server that does not validate — diffs against the wrong baseline and produces spans that do not
  correspond to any version of the text.
- Compounding it, a per-tab cache is destroyed on every teardown: an inactive tab gets the idle plugin
  (`editor.tsx:68` passes `enabled: active`), which disposes the contribution and closes the socket.
  The cache would rarely survive long enough to pay for itself.

The proxy has none of those problems. It is per backend, it already owns per-document state
(`SharedDocument`, `:40-45`), and it outlives every tab by `lsp.idleTimeoutMs`. **Because the cache
lives there, the browser never holds a `resultId` at all** — which satisfies §C7 more strongly than the
explicit-invalidation option it also permits.

**Design.**

- Cache entry per `(uri)` within a session: `{ resultId, data: Uint32Array }`. It exists **only** as a
  delta baseline — it is never served to a client as a response.
- On a client `textDocument/semanticTokens/full` for a document where the backend advertises
  `full.delta === true` **and** a cache entry exists: rewrite the outbound method to
  `semanticTokens/full/delta` and attach `previousResultId`. Rewrite the response back to a full
  `SemanticTokens` before it reaches the client. **The client's request and the client's response shape
  are unchanged**, and no `full/delta` request and no `SemanticTokensDelta` ever crosses the WebSocket
  (§9 asserts this at the transport boundary).
- On a `SemanticTokensDelta` response: apply the edits to the cached array — each edit is
  `{ start, deleteCount, data? }` over the flat uint32 array — store the new `resultId`, and emit the
  reassembled array.
- On an error naming an unknown `previousResultId`: drop the entry and retry once as a plain `full`.
  Count it; a server that does this routinely should be dropped from the delta set.
- **Serialize token requests per `(uri)` within a session.** Two concurrent `full/delta` requests
  carrying the same `previousResultId` make the server issue two new result ids, and the cache can
  only follow one. While one is in flight, later `full` requests for the same uri from other
  connections attach to the same backend request and receive the same reassembled result — which is
  also a straight win when three tabs show the same file.
- **Range requests pass through untouched.** They are not cacheable, not coalesceable, and carry no
  `resultId`.
- Invalidate on `didClose` of the last owner (`:492-518`), on `closeFromProcess` (`:675-684`), and on
  idle disposal.

**What the proxy must not do:** convert a client `range` request into a `full` one, cache responses
for reuse, or decode anything. It rewrites one method into another and reassembles one array. Every
other transformation belongs on one side or the other, not in the middle.

---

## 7. Failure modes and what the user sees

### 7.1 The one that exists today and must be fixed first

**A backend death is invisible.** `closeFromProcess` (`:675-684`) removes the session, rejects pending
requests and closes every client socket. In the browser,
`/Users/shaul/Desktop/D/Editor/packages/lsp/src/transports.ts:121-124` clears its handlers and
`LspConnection` has no close callback, so status stays `'ready'` and **there is no reconnect anywhere
in the stack**. The failure only surfaces when the next request throws.

For the token path specifically, the painted-spans half of this is already covered: a torn-down
connection disposes the view contribution, which disposes the layer (§C9 signal 1), so stale colour does
not survive a backend death. **What is not covered is the status lie**, and it is worse for tokens than
for diagnostics because confident colour plus a green indicator reads as working software.

The platform half is making the proxy send a reason (`routes.ts:99-110` and `:675-684` both close bare
today) and is P4. **The editor half — a close callback on `LspConnection` carrying that reason — is
scheduled in neither plan, and this plan does not schedule it either.** It is named here as an open
item rather than left as an assumption: until it exists, the status indicator is wrong on backend death
and the mitigation is that the layer clears anyway.

### 7.2 The full table

| Failure                                          | Detection                                                                                           | User sees                                                                                                                                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server has no provider                           | P1's negotiated data                                                                                | Nothing. No request is ever made. Existing shiki colour, unchanged.                                                                                                                                                                              |
| Provider advertised, empty result (D2)           | Zero tokens on a non-trivial file                                                                   | **Must be logged as a warning.** This is the D2 shape and it is indistinguishable from a boring file without instrumentation.                                                                                                                    |
| **Token name resolves to no style and no alias** | `unresolvedTypeNames` on `push()`'s verdict (§C1)                                                   | Nothing — the syntactic layer shows through, which is §C4's intended fall-through. **Logged with the name and a count per `serverId`**, because for a new server this is the common case and it is what P2's coverage assertion exists to catch. |
| `full` refused, file too large (§4.2)            | Error response                                                                                      | Range answer only; whatever is off-screen is uncoloured until scrolled to. Logged once per document, not per request.                                                                                                                            |
| Request timeout                                  | §6.2                                                                                                | Previous spans stay until the next successful push; layer cleared after two consecutive timeouts.                                                                                                                                                |
| Request cancelled                                | `LspRequestCancelledError`                                                                          | Nothing. This is the normal path while typing.                                                                                                                                                                                                   |
| Backend death                                    | §7.1                                                                                                | Layer cleared by contribution disposal. Status indicator is wrong until §7.1's open item lands.                                                                                                                                                  |
| Binary missing                                   | `pool.acquire` returns null → socket closed                                                         | Status error with a reason, not a silent close.                                                                                                                                                                                                  |
| Legend index out of range                        | The per-rule drop counts the editor's decoder returns beside its spans (§C7, editor M4), read by P2 | Nothing — the tuple is dropped and the rest of the payload paints normally. **Counted and logged once per session per `serverId`**; a server doing this emits tokens the client cannot name and the count belongs in the bug report.             |
| Payload dropped for a moved `textVersion`        | `push()`'s verdict (§C5)                                                                            | **Painted spans stay where they are**, held as anchors; nothing disappears wholesale. The controller waits for `onResyncRequired` and then issues one full non-delta request (§C9).                                                              |

---

## 8. Settings

Three keys, all `machine` scope, all in `packages/contracts/src/settings/keys.ts` alongside the
existing `lsp.*` block (`:343`, `:361`, `:377`, `:390`) and following its conventions — clamped
schemas, an honest `description`, `visibility: 'advanced'`.

- **`lsp.semanticTokens.enabled`** (boolean, default `false` until P3 completes, then `true`) — the
  master switch. Off means **no request is ever issued**; the declared capability does not change,
  because it must stay a pure function of `serverId` (§1 under §C3) and a setting read at capability-
  build time would make it a function of when the tab opened. This is the rollback lever and it must not
  require a restart: read it per request, the way `registry.ts:491-510` re-reads `lsp.servers`.
- **`lsp.semanticTokens.servers`** (record of `serverId → boolean`, default `{}`) — per-server
  override, so typescript-language-server can ship dark while rust-analyzer ships live, and so a
  single misbehaving server can be turned off without turning off the feature. Merged over the
  registry's own per-server default. Same rule: it gates requests, never the declared block.
- **`lsp.semanticTokens.delta`** (boolean, default `false`) — P5's gate. Exists so the measurement in
  §4.3 can be repeated on a user's machine against their repository rather than only on ours. This one
  _is_ readable at capability-build time in principle, but is not read there — the block declares
  `full.delta` from the registry's per-server table, and the setting gates whether the **proxy** uses
  the delta branch (§6.3), which is per backend and therefore already the right granularity.

No `machine`-scope decision here is close: all three govern child-process traffic and CPU on one box.

---

## 9. Tests and gates

- **The capability byte-identity test** (P1, and the invariant §1 under §C3 rests on): for every
  `serverId` in the table plus the default, build the block twice through the real plugin-construction
  path with two different documents and two different roots, and assert the two `JSON.stringify`
  results are identical strings. Assert also that the block carries no `multilineTokenSupport`, no
  `overlappingTokenSupport` and no `dynamicRegistration` — absences, not `false` values — and that
  `clientInfo.name` is neither VS Code name.
- **A two-tab integration test for terraform-ls** (P3) proving the _advertised legend_ is identical in
  both tabs against a server that intersects — the end-to-end counterpart of the unit test above.
- **Proxy unit tests**, against a scripted fake backend (the existing pattern in
  `apps/server/src/lsp/`): delta reassembly against a known array; unknown-`previousResultId` retry;
  per-uri serialization with three concurrent client requests; configuration reply honouring
  `items[].section`; **the refresh downgrade** producing exactly one `workspace/semanticTokens/refresh`
  _notification_ per connection and one `null` answer to the server; **and no inbound server request
  forwarded to any connection**, which is what keeps `routeClientMessage`'s response fall-through
  (`:297-303`) dead (P4).
- **No decoder tests here.** The decoder is the editor's shipped export and its rejection rules —
  out-of-legend type index dropped _with the cursor still advancing_, modifier bits past the legend
  length ignored, zero-length tuples dropped, `deltaLine` past the last line dropped, duplicate legend
  names decoded by index — are editor M4's exit criteria, over its single fixture. Duplicating them here
  is how the fleet ends up running the untested copy. What this side asserts is that its controller
  calls that export with the legend from the cached `initializeResult`, in the integration tests below.
- **Alias-coverage tests** (P2/P3): for each shortlist server, drive a payload carrying every name in
  its advertised legend and assert `push()`'s `unresolvedTypeNames` is empty, or that every name in it
  appears in an explicit known-uncovered list with a reason. This is the test that would have caught 38
  of rust-analyzer's 57 types dropping silently, and it reads the verdict field §C1 added for exactly
  this purpose rather than inventing a parallel counter.
- **Integration tests** that spawn the real binary and skip when absent — one per shortlist server,
  asserting the §4.1 row. These are the only defence against a server upgrade silently changing the
  answer, and they are the reason §4.1 records versions.
- **A regression test that no `full/delta` request and no `SemanticTokensDelta` ever crosses the
  WebSocket** (§6.3), asserted at the transport boundary rather than by inspection.
- Existing gates unchanged: typecheck, lint, `bun test` in both apps.

---

## 10. Risks

| Risk                                                                        | Severity          | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The two plans drift again                                                   | **High**          | §1 cites `§C1`–`§C9` and restates nothing; the ids are the editor's and there is one numbering. The first draft of this file restated six terms under colliding ids and four of them drifted — that is the evidence, not a worry. Any future edit that copies a definition into this file is the regression.                                                                                                                                                                                                                                                                             |
| A term ends up owned by neither side                                        | **High**          | §1 records an owner for every term the cross-check found floating: the capability block and `augmentsSyntaxTokens` (here, per `serverId`), `scopeAliases` (here, per server), the decoder (editor, cited), throttling (here, one number), `multilineTokenSupport` (the declaration is here — left unset, which is `false` on the wire — until the editor's criterion passes), refresh (both, via the notification route: the downgrade here, the handler seam in editor M3). `LspConnection`'s close callback is the one item owned by neither, and §7.1 says so instead of assuming it. |
| Semantic colour looks worse than shiki on a language shiki does well        | Medium            | Ship per-server (§8), TypeScript last (§3.1), and have a human look at a real theme before enabling it. The priority band is the editor's decision and it is the thing most likely to look wrong.                                                                                                                                                                                                                                                                                                                                                                                        |
| A server upgrade silently changes its legend or drops a capability          | Medium            | P1's negotiated-capability logging, §9's alias-coverage tests, and §9's integration tests. Every number in §4 is a snapshot with a version next to it.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **P2 blocked indefinitely** because the editor's M4/M5 approval is declined | Medium            | §5.0 states the dependency. P0 and P1 stand alone and are worth landing regardless; P0 fixes three live defects and P1 makes the negotiation visible for every server.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Delta reassembly produces spans that do not match the text                  | **High if built** | The proxy holds the document text (`:487-488`); assert the reassembled array's cumulative line/character walk stays within it, in dev builds. Fall back to `full` on any inconsistency and count it.                                                                                                                                                                                                                                                                                                                                                                                     |
| Per-keystroke `full` on a full-only server with a big file                  | Medium            | §6.1's viewport rule plus §6.2's timeouts; §4.2's size cap makes the Go case an error rather than a hang. clangd is the real exposure and is why P5 exists.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The 100 KB / no-range / config-gate quirks multiply as servers are added    | Medium            | They live in the registry as data with a citation each, never in the editor package (§0.3). A quirk without a measurement in §4 does not get added.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Two tabs on one root fight over the backend                                 | Medium            | §6.3's per-uri serialization; the per-`serverId` constant block; §C5's browser-local versioning. All three are consequences of pooling and all three are already designed for it.                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## 11. De-scoped, with reasons

- **Multi-server semantic tokens for one document.** `matchLspServer` returns the first candidate by
  priority (`registry.ts:57`, `:639-645`) and one server per document is the shape of the whole LSP
  layer here. Merging two servers' token streams is a different feature that needs substrate S12's
  multi-server work first.
- **A second decoder in this repo.** Editor M4 ships `decodeSemanticTokens` from `packages/lsp-plugin`
  as a reusable export specifically so a host driving the paint layer does not reimplement the
  relative-cursor walk. The earlier draft of this file specified one anyway and dropped a rule doing
  it. §1 under §C7.
- **A request-side controller borrowed from the editor.** There is none to borrow: the editor's
  contract preamble states it ships no `SemanticTokensController`, only the decoder. P2 writes this
  side's controller, copying the shape of `documentHighlightController.ts` as §C8 directs.
- **Server-side decoding.** Decoded spans carrying legend names are roughly 4× the size of the packed
  array they replace, so decoding in the proxy would make the browser-bound payload larger, not
  smaller. Decode where the result is consumed — which is the browser, calling the editor's export.
- **A proxy response cache.** Tempting and wrong: it would have to be invalidated on every `didChange`
  and would then almost never hit. The proxy's cache exists only as a delta baseline (§6.3).
- **The `workspace/semanticTokens/refresh` _request_ route.** Forwarding the server's request to the
  browser and having it answer needs an inbound server-request seam in the editor's client, and §C9
  de-scopes that on both sides: `LspClient.handleRequest` keeps answering method-not-found
  unconditionally (`/Users/shaul/Desktop/D/Editor/packages/lsp/src/client.ts:483-490`) and the seam an
  earlier editor draft carried for it is cut. An earlier draft of _this_ file specified the request
  route anyway and de-scoped the notification downgrade in its place, on the premise that the downgrade
  needed a _notification_ handler seam neither plan owned — which the editor's merged
  `notificationHandlers` (M3 part one) falsifies; each draft was reconciling against the other's
  superseded text. So: notification downgrade, P4, both halves owned (§1 under §C9). Forwarding an
  inbound request would additionally wake the response fall-through at `routeClientMessage:297-303`,
  which the downgrade leaves dead.
- **`multilineTokenSupport`.** Left unset by P1's builder call — `false` on the wire — and the
  editor's builder refuses the flag anyway until its M5 multi-line criterion passes. Under a `false`
  declaration a conformant server sends no multi-line token, so this plan asserts nothing about
  multi-line painting against a live server; the earlier draft's decoder test covered "multi-line
  tokens", which could only have passed against a non-conformant server. Multi-line decoding is
  asserted over literal 5-tuples in editor M4 and needs no capability. Raising the flag afterwards
  is one line here.
- **Dynamic registration.** P1 cannot declare it at all: §C3 de-scopes it on both sides and the editor's
  builder offers no way to express it, so it is absent, which is the `false` this proxy needs. It would
  unlock deno, dart and tinymist's preferred path, but the proxy answers `client/registerCapability`
  itself (`:605-608`), and forwarding it means the inbound-request machinery **neither plan builds** —
  P4's downgrade exists precisely to avoid it — plus a `registerCapability` handler in the browser and a
  legend that can change after `initialize`, which the pooled, replayed `initializeResult` (`:331,354`)
  cannot currently express. Revisit with tinymist in §3.2's second wave, not before.
- **Semantic colour in the minimap, sticky scroll and the diff panes.** Structural under the contract's
  paint shape; stated in both plans in the same words at the end of §1.
