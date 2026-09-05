import type {
  EnvironmentId,
  ClientOrchestrationCommand,
  OrchestrationDispatchResult,
  OrchestrationReplayEventsInput,
  OrchestrationReplayEventsResult,
  OrchestrationShellStreamItem,
  OrchestrationSessionDetailPage,
  OrchestrationSessionDetailSnapshot,
  OrchestrationSessionStreamItem,
  OrchestrationWsSessionDetailPageInput,
  SessionId,
} from '@workspace/contracts'

import type { OrchestrationStreamInput } from '../transport/orchestration-streams'

export type ChatTransport = {
  readonly environmentId: EnvironmentId
  readonly closed: boolean
  close(): void
  retainSessionDetail(sessionId: SessionId): () => void
  loadEarlierPage(sessionId: SessionId): Promise<boolean>
  dispatchCommand: (command: ClientOrchestrationCommand) => Promise<OrchestrationDispatchResult>
  replayEvents: (input: OrchestrationReplayEventsInput) => Promise<OrchestrationReplayEventsResult>
  shellStream: (input?: OrchestrationStreamInput) => AsyncIterable<OrchestrationShellStreamItem>
  /** One page of rows older than the boundary the caller holds. */
  sessionDetailPage: (
    input: OrchestrationWsSessionDetailPageInput,
  ) => Promise<OrchestrationSessionDetailPage>
  sessionDetailSnapshot: (sessionId: SessionId) => Promise<OrchestrationSessionDetailSnapshot>
  sessionDetailStream: (
    sessionId: SessionId,
    input?: OrchestrationStreamInput,
  ) => AsyncIterable<OrchestrationSessionStreamItem>
}
