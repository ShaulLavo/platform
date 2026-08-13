import { useSettings } from '@/features/settings/hooks/use-settings'
import { readSettingsMirror } from '@/features/settings/utils/boot-mirror'
import { WebWallpaper } from '@/features/workbench/components/web-wallpaper'
import { hasNativeVibrancy } from '@/lib/platform/native-vibrancy'

// The desktop shell is a transparent window over an NSVisualEffectView, so macOS
// composites the live desktop behind the UI for free. Drawing a wallpaper here
// too would only cover it up — and the animated case cost a permanent
// full-screen video decode. In a browser there is nothing behind the page, so
// the web layer still has to draw it.
export function Wallpaper({ className }: { readonly className?: string }) {
  // The `data-wallpaper-hidden` attribute that switches off the popover vibrancy
  // layer is written by `applyAppearance`, alongside the other appearance
  // settings — two writers for one attribute is how it would end up disagreeing
  // with itself. This component owns only whether the media is mounted.
  const settings = useSettings()
  const enabled =
    settings.data?.values['workbench.wallpaper.enabled'] ??
    readSettingsMirror()['workbench.wallpaper.enabled']

  // Unmounting is the point: hiding it with CSS would leave the video decoding.
  if (!enabled) return null
  if (hasNativeVibrancy()) return null

  return <WebWallpaper className={className} />
}
