import { cn } from '@workspace/ui/lib/utils'

import { isDesktop } from '@/lib/platform/bridge'
import { WALLPAPER_URL } from '@/features/workbench/utils/wallpaper'

export function Wallpaper({ className }: { readonly className?: string }) {
  // Desktop frosts the user's real macOS wallpaper natively (see globals.css
  // [data-desktop] + apps/desktop window-effects.mm); skip the shipped image.
  if (isDesktop()) return null

  return (
    <div
      aria-hidden='true'
      className={cn('pointer-events-none absolute inset-0 z-0 bg-cover bg-center', className)}
      data-workbench-wallpaper=''
      style={{ backgroundImage: `url(${WALLPAPER_URL})` }}
    />
  )
}
