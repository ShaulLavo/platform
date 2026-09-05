import { canonicalServerOrigin } from '@workspace/client-core/transport/client'

const activities = new Map<string, AbortController>()

export function environmentActivitySignal(origin: string): AbortSignal {
  origin = canonicalServerOrigin(origin)
  let activity = activities.get(origin)
  if (!activity) {
    activity = new AbortController()
    activities.set(origin, activity)
  }
  return activity.signal
}

export function suspendEnvironmentActivity(origin: string): void {
  origin = canonicalServerOrigin(origin)
  environmentActivitySignal(origin)
  activities.get(origin)?.abort()
}

export function resumeEnvironmentActivity(origin: string): void {
  origin = canonicalServerOrigin(origin)
  if (!environmentActivitySignal(origin).aborted) return
  activities.set(origin, new AbortController())
}
