import type {
  ClientOrchestrationCommand,
  OrchestrationDispatchResult,
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

export type ChatTransport = {
  readonly closed: boolean
  close(): void
  retainThreadDetail(threadId: ThreadId): () => void
  loadEarlierPage(threadId: ThreadId): Promise<boolean>
  dispatchCommand: (command: ClientOrchestrationCommand) => Promise<OrchestrationDispatchResult>
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
