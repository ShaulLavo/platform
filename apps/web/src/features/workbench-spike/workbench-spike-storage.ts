import { parseWorkbenchSpikeSerializedState } from '@/features/workbench-spike/workbench-spike-serialization'
import type { WorkbenchSpikeSerializedState } from '@/features/workbench-spike/workbench-spike-types'

const WORKBENCH_SPIKE_STORAGE_KEY = 'platform:dockview-workbench-spike:v1'

export function readWorkbenchSpikeState(): WorkbenchSpikeSerializedState | null {
  const raw = window.localStorage.getItem(WORKBENCH_SPIKE_STORAGE_KEY)
  if (!raw) return null

  try {
    return parseWorkbenchSpikeSerializedState(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeWorkbenchSpikeState(state: WorkbenchSpikeSerializedState) {
  window.localStorage.setItem(WORKBENCH_SPIKE_STORAGE_KEY, JSON.stringify(state))
}

export function clearWorkbenchSpikeState() {
  window.localStorage.removeItem(WORKBENCH_SPIKE_STORAGE_KEY)
}
