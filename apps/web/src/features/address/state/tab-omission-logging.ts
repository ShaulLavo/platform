import { MAX_APPLIED_TABS } from '@workspace/client-core/address/grammar'
import { log } from '@/lib/client-logging'

type TabOmission = {
  readonly bytes: number
  readonly signature: string
  readonly tabCount: number
}

let lastSignature: string | null = null

export function reportTabOmission({ bytes, signature, tabCount }: TabOmission): void {
  if (signature === lastSignature) return

  lastSignature = signature
  log.debug({
    action: 'address.tabs_omitted',
    area: 'address',
    bytes,
    maxAppliedTabs: MAX_APPLIED_TABS,
    tabCount,
  })
}
