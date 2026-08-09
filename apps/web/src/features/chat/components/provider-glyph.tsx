import type { ProviderDriverKind } from '@workspace/contracts'
import { cn } from '@workspace/ui/lib/utils'

import { providerBrandMark } from '@/features/chat/lib/provider-brand-marks'
import { ProviderMonogram } from '@/features/chat/components/provider-monogram'

/**
 * The provider's vendor mark, filled from a brand token so it survives the
 * theme flip. Falls back to a monogram for a driver kind we ship no mark for —
 * a wrong logo is worse than two letters.
 */
export function ProviderGlyph({
  className,
  displayLabel,
  driverKind,
}: {
  readonly className?: string
  readonly displayLabel: string
  readonly driverKind: ProviderDriverKind
}) {
  const mark = providerBrandMark(driverKind)
  if (!mark) return <ProviderMonogram className={className} displayLabel={displayLabel} />

  return (
    <svg
      aria-hidden='true'
      className={cn('shrink-0', mark.fillClass, className)}
      preserveAspectRatio='xMidYMid'
      viewBox={mark.viewBox}
    >
      <path d={mark.path} />
    </svg>
  )
}
