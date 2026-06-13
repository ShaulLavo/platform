import { cn } from '@workspace/ui/lib/utils'

import { WALLPAPER_URL } from '@/features/workbench/utils/wallpaper'

export function Wallpaper({ className }: { readonly className?: string }) {
  return (
    <div
      aria-hidden='true'
      className={cn('pointer-events-none absolute inset-0 z-0 bg-cover bg-center', className)}
      data-workbench-wallpaper=''
      style={{ backgroundImage: `url(${WALLPAPER_URL})` }}
    />
  )
}
