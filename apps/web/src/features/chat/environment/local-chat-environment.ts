import {
  dispatchOrchestrationCommand,
  replayOrchestrationEvents,
} from '../transport/orchestration-client'
import {
  subscribeOrchestrationShell,
  subscribeOrchestrationThreadDetail,
} from '../transport/orchestration-streams'
import type { ChatEnvironment } from './chat-environment'

export function createLocalChatEnvironment(): ChatEnvironment {
  return {
    dispatchCommand: dispatchOrchestrationCommand,
    replayEvents: replayOrchestrationEvents,
    shellStream: subscribeOrchestrationShell,
    threadDetailStream: subscribeOrchestrationThreadDetail,
  }
}
