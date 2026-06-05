import {
  flushObservability,
  initializeObservabilityRuntime,
  observabilityConfig,
  recordObservabilityError,
  recordObservabilityInfo,
  recordObservabilityWarning,
} from '@workspace/observability'

export function initializeDesktopObservability() {
  return initializeObservabilityRuntime({
    env: Bun.env,
    source: 'desktop',
  })
}

export { flushObservability as flushDesktopObservability }

export function recordDesktopInfo(action: string, context: Record<string, unknown> = {}) {
  recordObservabilityInfo(action, desktopContext(context))
}

export function recordDesktopWarning(action: string, context: Record<string, unknown> = {}) {
  recordObservabilityWarning(action, desktopContext(context))
}

export function recordDesktopError(action: string, context: Record<string, unknown> = {}) {
  recordObservabilityError(action, desktopContext(context))
}

export function shouldInheritChildOutput() {
  const config = observabilityConfig()
  return config.enabled && config.consoleEnabled
}

function desktopContext(context: Record<string, unknown>) {
  return {
    area: 'desktop',
    ...context,
  }
}
