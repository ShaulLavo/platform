import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { createClientError } from '@/lib/structured-errors'

/**
 * A `ChatEnvironment` where every seam refuses loudly, for tests that exercise
 * one of them. Overriding only what a test drives keeps the refusal as the
 * assertion: a call the test did not intend fails with the method's name rather
 * than returning a plausible empty value and passing for the wrong reason.
 *
 * It also means adding a transport method does not need an edit in every test
 * that happens to build an environment.
 */
export function unsupportedChatEnvironment(
  overrides: Partial<ChatEnvironment> = {},
): ChatEnvironment {
  return {
    dispatchCommand: () => unsupported('dispatchCommand'),
    replayEvents: () => unsupported('replayEvents'),
    shellStream: () => unsupportedStream('shellStream'),
    threadDetailPage: () => unsupported('threadDetailPage'),
    threadDetailSnapshot: () => unsupported('threadDetailSnapshot'),
    threadDetailStream: () => unsupportedStream('threadDetailStream'),
    ...overrides,
  }
}

function unsupported(method: string): never {
  throw createClientError({
    code: 'TEST_UNSUPPORTED',
    message: `${method} is not wired for this test.`,
    status: 500,
    why: 'The test built a chat environment without implementing this seam.',
    fix: `Pass a ${method} override to unsupportedChatEnvironment.`,
  })
}

async function* unsupportedStream(method: string) {
  unsupported(method)
  // Unreachable: `unsupported` is typed `never`. Present so the generator's
  // yield type is inferred rather than `undefined`.
  yield await Promise.reject(new Error(method))
}
