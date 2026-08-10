import type {
  ClientOrchestrationCommand,
  OrchestrationReplayEventsInput,
  OrchestrationReplayEventsResult,
  OrchestrationShellStreamItem,
  OrchestrationThreadDetailPage,
  OrchestrationThreadDetailSnapshot,
  OrchestrationThreadStreamItem,
  OrchestrationWsThreadDetailPageInput,
  ThreadId,
} from '@workspace/contracts'

import type { OrchestrationStreamInput } from '../transport/orchestration-streams'

export type ChatEnvironment = {
  dispatchCommand: (
    command: ClientOrchestrationCommand,
  ) => Promise<{ deduped: boolean; sequence: number }>
  replayEvents: (input: OrchestrationReplayEventsInput) => Promise<OrchestrationReplayEventsResult>
  shellStream: (input?: OrchestrationStreamInput) => AsyncIterable<OrchestrationShellStreamItem>
  /** One page of rows older than the boundary the caller holds. */
  threadDetailPage: (
    input: OrchestrationWsThreadDetailPageInput,
  ) => Promise<OrchestrationThreadDetailPage>
  threadDetailSnapshot: (threadId: ThreadId) => Promise<OrchestrationThreadDetailSnapshot>
  threadDetailStream: (
    threadId: ThreadId,
    input?: OrchestrationStreamInput,
  ) => AsyncIterable<OrchestrationThreadStreamItem>
}
