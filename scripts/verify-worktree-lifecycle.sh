#!/usr/bin/env bash
set -euo pipefail

task_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

verify_contracts() {
  cd "$task_root/packages/contracts"
  bun run test -- src/tests/orchestration.test.ts src/tests/orchestration-ws.test.ts src/tests/worktree-lifecycle.test.ts
  bun run typecheck
  bun run lint
  bun run format:check
}

verify_client_core() {
  cd "$task_root/packages/client-core"
  bun run test -- src/transport/tests/sequence.test.ts src/transport/tests/orchestration-rpc-client.test.ts
  bun run typecheck
  bun run lint
  bun run format:check
}

verify_server() {
  cd "$task_root/apps/server"
  bun --bun vitest run \
    src/db/tests/migrations.test.ts \
    src/git/tests/worktrees.test.ts src/git/tests/worktree-list.test.ts \
    src/git/tests/repository-lane.test.ts src/git/tests/base-refs.test.ts \
    src/git/tests/commit-message-generator.test.ts \
    src/orchestration/tests/worktree-*.test.ts \
    src/orchestration/tests/terminal-lease-recovery.test.ts \
    src/orchestration/tests/engine.test.ts \
    src/orchestration/tests/checkpoint-diff-query.test.ts \
    src/orchestration/tests/checkpoint-reactor.test.ts \
    src/orchestration/tests/recovery.test.ts \
    src/orchestration/tests/registration.test.ts \
    src/orchestration/tests/decider-invariants.test.ts \
    src/orchestration/tests/ws-rpc.test.ts \
    src/orchestration/tests/session-lifecycle.test.ts \
    src/orchestration/tests/session-deletion.test.ts \
    src/orchestration/tests/streams.test.ts \
    src/orchestration/tests/provider-start-deletion-race.test.ts \
    src/provider/tests/provider-service.test.ts \
    src/provider/adapters/tests/codex.test.ts \
    src/provider/adapters/tests/claude.test.ts \
    src/provider/adapters/tests/process-lifetime.test.ts \
    src/terminal/tests/service.test.ts
  bun run typecheck
  bun run lint
  bun run format:check
}

verify_web() {
  cd "$task_root/apps/web"
  bun --bun vitest run --project node --project dom \
    src/features/chat/tests/worktree-lifecycle.integration.test.tsx \
    src/features/chat/utils/tests/command-builders.test.ts \
    src/features/chat-mode/components/tests/worktree-*.test.tsx \
    src/features/chat-mode/components/tests/session-rail.test.tsx \
    src/features/chat-mode/components/tests/stage-header.test.tsx \
    src/features/chat-mode/utils/tests/session-rail-model.test.ts \
    src/features/chat/state/tests/chat-projection-writers.test.ts \
    src/features/chat/state/tests/worktree-fanout.test.ts \
    src/keymap/tests/session-commands.test.ts
  bun run typecheck
  bun run lint
  bun run format:check
}

if (( $# == 0 )); then
  set -- contracts client-core server web
fi
for target in "$@"; do
  case "$target" in
    contracts) verify_contracts ;;
    client-core) verify_client_core ;;
    server) verify_server ;;
    web) verify_web ;;
    *) echo "Unknown verification target: $target" >&2; exit 2 ;;
  esac
done

cd "$task_root"
if rg -n 'worktrees/create|worktrees/remove|requestWorktree|isolateNextSession' \
  apps/server/src apps/web/src --glob '!**/tests/**'; then
  exit 1
fi
git diff --check
