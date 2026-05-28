import {
  dispatchOrchestrationCommandRpc,
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
    threadDetailSnapshot: fetchOrchestrationThreadDetailSnapshotRpc,
    threadDetailStream: subscribeOrchestrationThreadDetailRpc,
  }
}
