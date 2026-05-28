import type {
  ClientOrchestrationCommand,
  OrchestrationReplayEventsInput,
  OrchestrationReplayEventsResult,
  OrchestrationShellStreamItem,
  OrchestrationThreadDetailSnapshot,
  OrchestrationThreadStreamItem,
  ThreadId,
} from '@workspace/contracts'

import type { OrchestrationStreamInput } from '../transport/orchestration-streams'

export type ChatEnvironment = {
  dispatchCommand: (
    command: ClientOrchestrationCommand,
  ) => Promise<{ deduped: boolean; sequence: number }>
  replayEvents: (input: OrchestrationReplayEventsInput) => Promise<OrchestrationReplayEventsResult>
  shellStream: (input?: OrchestrationStreamInput) => AsyncIterable<OrchestrationShellStreamItem>
  threadDetailSnapshot: (threadId: ThreadId) => Promise<OrchestrationThreadDetailSnapshot>
  threadDetailStream: (
    threadId: ThreadId,
    input?: OrchestrationStreamInput,
  ) => AsyncIterable<OrchestrationThreadStreamItem>
}
