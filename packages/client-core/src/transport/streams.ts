export type OrchestrationStreamInput = {
  afterSequence?: number
  signal?: AbortSignal
  onSynchronized?: () => void
}
