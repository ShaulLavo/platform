import { useEffect } from 'react'

import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { WebWallpaper } from '@/features/workbench/components/web-wallpaper'
import { hasNativeVibrancy } from '@/lib/platform/native-vibrancy'

// The desktop shell is a transparent window over an NSVisualEffectView, so macOS
// composites the live desktop behind the UI for free. Drawing a wallpaper here
// too would only cover it up — and the animated case cost a permanent
// full-screen video decode. In a browser there is nothing behind the page, so
// the web layer still has to draw it.
export function Wallpaper({ className }: { readonly className?: string }) {
  const wallpaperHidden = useEditorWorkspaceState((state) => state.wallpaperHidden)

  // Popovers and menus composite a pre-blurred copy of the wallpaper through
  // `surface-vibrancy`, independently of whether this component draws anything.
  // Tell the root so that layer switches off with the wallpaper itself.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-wallpaper-hidden', wallpaperHidden)
  }, [wallpaperHidden])

  // Unmounting is the point: hiding it with CSS would leave the video decoding.
  if (wallpaperHidden) return null
  if (hasNativeVibrancy()) return null

  return <WebWallpaper className={className} />
}
