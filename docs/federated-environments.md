# Federated environments

Machines are configured in `environments.machines` on the primary server. Settings → Machines
accepts SSH targets with an absolute Platform checkout path, or HTTPS and loopback HTTP URLs.
The local machine is implicit. SSH requires the desktop app, Bun and an existing remote checkout,
and noninteractive SSH authentication.

Connecting a machine is equivalent to handing it a root shell as your user, in both directions.
The Machines page states this trust boundary.

## Ownership

The server's persisted `EnvironmentId` owns its retained editor runtime, chat transport, browser
storage, and query cache. An endpoint is a route to that identity. Endpoint replacement is accepted
only after descriptor validation; it preserves the QueryClient and Client objects. A request
captures its endpoint when invoked, so a later switch cannot redirect work already in flight.

Each connected environment retains a shell subscription outside the keyed workbench subtree.
Switching suspends the outgoing editor's activity and subscriptions, while its documents, saves,
Git drafts, and chat connection survive. One command bus captures the current runtime for each
invocation. The rail groups repositories across environments and keeps each session's machine and
checkout identity.

Application setting commands read and write the primary settings owner even while another machine
is active. A successful Git commit clears its captured draft after a switch, unless the user has
edited that draft since submitting it.

Browser storage uses `env:<environmentId>|`. Registered checkout caches use confirmed `WorktreeId`
values. Ordinary folders have explicit folder locations until the server registers a checkout.
Workspace cache version 20 and chat projection cache version 3 replace the old caches without a
migration. Clear the old development site data once when adopting this change.

Cached descriptors supply expected identity and stale display data. Fresh health responses and
WebSocket handshakes validate identity and protocol before accepting current server data. Cached
machine configuration comes from the existing settings mirror; the primary settings document
remains authoritative. Connected machine names use `platform.environments.connected.v1`.

Unreachable machines keep readable cached rows and buffers. Tree and Git show a stale notice;
terminal and editor controls refuse unavailable operations. Recovery runs independently for each
machine. Identity drift and blocked connections require an explicit retry.
Editing a disconnected machine keeps it disconnected.

## Desktop SSH lifecycle

The desktop bridge exposes connect, disconnect, and machine state events. The shell resolves names
against its primary settings document and invokes SSH in batch mode with strict host-key checks.
Both the remote server and the local forward bind to loopback.

The launcher probes Bun and the checkout, starts or reuses a server, forwards a local port, and
checks health. Each connection retry checks the forwarded health endpoint, even when the SSH
process is still alive. A dropped chat connection schedules this retry so a crashed managed server
can restart. A healthy managed server keeps its PTYs.

Each machine entry owns a lease in the remote checkout's `.platform-ssh-launch/` directory. Aliases
that use the same managed server hold separate leases on one process record. Disconnect releases
that machine's lease. The final release stops the managed process only if its saved start stamp
still matches. A checkout-local SQLite lock serializes launch and stop operations. Restart replaces
the shared process record, so existing leases follow the replacement process. External servers
remain running. The launcher retains the local port for reconnection during its lifetime.

Electrobun's quit handler cancels the initial quit request synchronously. After local child
processes and SSH connections finish cleanup, the handler allows a second quit request.

## Verification

Run `bash scripts/verify-federated-environments.sh` for the focused automated checks. The two-server
integration exercises real Elysia apps and filesystem roots through injected socket boundaries.
It covers repository grouping, independent buffers and saves, recovery, alias ownership, identity
drift, and restart lifetimes. Separate tests cover the machine picker, settings scope, cache
namespaces, cold rendering, retained checkout state, and delayed log attribution. Review
regressions cover synchronous quit cancellation, a remote crash with a live forward, concurrent
alias disconnects, interrupted lease publication, primary settings commands, disconnected-machine
edits, and commits that finish after switching machines.

On 2026-09-05, 62 contracts tests, 21 desktop tests, and 176 web tests passed. Contracts,
client-core, desktop, and web typechecks pass. Desktop and web lint and formatting, generated
settings schema/reference checks, and diff checks pass.

The real desktop gate is still open. On 2026-09-05, strict SSH verification refused `localhost`
because no trusted ED25519 host key was recorded. No SSH configuration was changed. A running
Platform dev server was also unavailable; ports 3000 and 3100 belonged to another project.
No replacement dev server was started. After the host key is verified and the Platform dev server
is running, complete Plan 078's localhost forward and browser checks before deleting the plan.
