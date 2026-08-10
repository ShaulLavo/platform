import {
  dispatchOrchestrationCommandRpc,
  fetchOrchestrationThreadDetailPageRpc,
  fetchOrchestrationThreadDetailSnapshotRpc,
  replayOrchestrationEventsRpc,
  subscribeOrchestrationShellRpc,
  subscribeOrchestrationThreadDetailRpc,
} from '../transport/orchestration-rpc-client'
import type { ChatEnvironment } from './chat-environment'

export function createLocalChatEnvironment(): ChatEnvironment {
  return {
    dispatchCommand: dispatchOrchestrationCommandRpc,
    replayEvents: replayOrchestrationEventsRpc,
    shellStream: subscribeOrchestrationShellRpc,
    threadDetailPage: fetchOrchestrationThreadDetailPageRpc,
    threadDetailSnapshot: fetchOrchestrationThreadDetailSnapshotRpc,
    threadDetailStream: subscribeOrchestrationThreadDetailRpc,
  }
}
