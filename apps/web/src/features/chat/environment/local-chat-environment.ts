import { fetchOrchestrationThreadDetailSnapshotHttp } from '../transport/orchestration-http-snapshots'
import {
  dispatchOrchestrationCommandRpc,
  fetchOrchestrationThreadDetailPageRpc,
  replayOrchestrationEventsRpc,
  subscribeOrchestrationShellRpc,
  subscribeOrchestrationThreadDetailRpc,
} from '../transport/orchestration-rpc-client'
import type { ChatEnvironment } from './chat-environment'

/**
 * Two transports on purpose. Commands, replay and the subscriptions need the
 * socket's ordering against the event stream; the authoritative snapshot read
 * is a large one-shot body that would head-of-line-block every other frame
 * while it is written, so it goes over HTTP.
 */
export function createLocalChatEnvironment(): ChatEnvironment {
  return {
    dispatchCommand: dispatchOrchestrationCommandRpc,
    replayEvents: replayOrchestrationEventsRpc,
    shellStream: subscribeOrchestrationShellRpc,
    threadDetailPage: fetchOrchestrationThreadDetailPageRpc,
    threadDetailSnapshot: fetchOrchestrationThreadDetailSnapshotHttp,
    threadDetailStream: subscribeOrchestrationThreadDetailRpc,
  }
}
