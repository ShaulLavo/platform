import { useState } from 'react'

import { cn } from '@workspace/ui/lib/utils'

import { WALLPAPER_URL } from '@/features/workbench/utils/wallpaper'
import { serverUrl } from '@/lib/client'

// The server serves the host's real macOS wallpaper at /wallpaper; index.html
// preloads it (see vite.config.ts) so it's cached before React mounts. crossorigin
// makes it a CORS request that carries an Origin past the server auth guard. Falls
// back to the shipped image only if the server can't read one (non-macOS, denied).
const DESKTOP_WALLPAPER_URL = `${serverUrl}/wallpaper`

export function Wallpaper({ className }: { readonly className?: string }) {
  const [src, setSrc] = useState(DESKTOP_WALLPAPER_URL)

  return (
    <img
      alt=''
      aria-hidden='true'
      className={cn(
        'pointer-events-none absolute inset-0 z-0 h-full w-full object-cover',
        className,
      )}
      crossOrigin='anonymous'
      data-workbench-wallpaper=''
      decoding='async'
      fetchPriority='high'
      onError={() => setSrc(WALLPAPER_URL)}
      src={src}
    />
  )
}
