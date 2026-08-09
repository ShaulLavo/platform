import { WebWallpaper } from '@/features/workbench/components/web-wallpaper'
import { hasNativeVibrancy } from '@/lib/platform/native-vibrancy'

// The desktop shell is a transparent window over an NSVisualEffectView, so macOS
// composites the live desktop behind the UI for free. Drawing a wallpaper here
// too would only cover it up — and the animated case cost a permanent
// full-screen video decode. In a browser there is nothing behind the page, so
// the web layer still has to draw it.
export function Wallpaper({ className }: { readonly className?: string }) {
  if (hasNativeVibrancy()) return null

  return <WebWallpaper className={className} />
}
