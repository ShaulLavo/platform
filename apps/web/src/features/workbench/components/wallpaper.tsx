import { useSettings } from '@/features/settings/hooks/use-settings'
import { readSettingsMirror } from '@/features/settings/utils/boot-mirror'
import { WebWallpaper } from '@/features/workbench/components/web-wallpaper'
import { hasNativeVibrancy } from '@/lib/platform/native-vibrancy'

// When the desktop shell runs as a transparent window over an NSVisualEffectView,
// macOS composites the live desktop behind the UI for free, and drawing a
// wallpaper here would only cover it up — the animated case at the cost of a
// permanent full-screen video decode. Whether the shell is actually transparent
// is the shell's to report; in a browser, and in an opaque shell window, nothing
// is behind the page and the web layer has to draw the wallpaper itself.
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
