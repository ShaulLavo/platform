export async function bootstrapOrchestration(steps: {
  migrate: () => void
  catchUp: () => void
  load: () => void
  recover: () => Promise<void>
  startReactors: () => void
}) {
  await Promise.resolve()
  steps.migrate()
  steps.catchUp()
  steps.load()
  await steps.recover()
  steps.startReactors()
}
