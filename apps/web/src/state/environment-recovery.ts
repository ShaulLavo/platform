import { streamReconnectDelayMs } from '@/features/chat/utils/stream-reconnect'

export function createEnvironmentRecovery(retry: (name: string) => Promise<void>) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const attempts = new Map<string, number>()
  const pending = new Set<string>()
  let disposed = false

  function clear(name: string) {
    clearTimeout(timers.get(name))
    timers.delete(name)
  }
  function schedule(name: string, blocked = false) {
    if (disposed) return
    clear(name)
    if (blocked) {
      forget(name)
      return
    }
    pending.add(name)
    if (!navigator.onLine) return
    const attempt = (attempts.get(name) ?? 0) + 1
    attempts.set(name, attempt)
    timers.set(
      name,
      setTimeout(() => {
        void retry(name)
      }, streamReconnectDelayMs(attempt)),
    )
  }
  function forget(name: string) {
    clear(name)
    pending.delete(name)
    attempts.delete(name)
  }
  function wake() {
    if (disposed || !navigator.onLine) return
    for (const name of pending) {
      clear(name)
      attempts.delete(name)
      void retry(name)
    }
  }
  function visible() {
    if (document.visibilityState === 'visible') wake()
  }
  window.addEventListener('online', wake)
  window.addEventListener('focus', wake)
  document.addEventListener('visibilitychange', visible)
  return {
    schedule,
    forget,
    dispose() {
      disposed = true
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', visible)
      for (const name of pending) forget(name)
    },
  }
}
