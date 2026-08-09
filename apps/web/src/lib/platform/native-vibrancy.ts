// In the desktop shell the window is transparent and macOS paints an
// NSVisualEffectView behind it, so the compositor supplies the blurred desktop
// for free. The web layer then has to stay out of the way: no opaque floor
// under the translucent surfaces, and no wallpaper of its own. In a browser
// there is nothing behind the page, so both stay.
export const NATIVE_VIBRANCY_ATTRIBUTE = 'data-native-vibrancy'

export function applyNativeVibrancy(isNativeShell: boolean) {
  if (!isNativeShell) return

  document.documentElement.setAttribute(NATIVE_VIBRANCY_ATTRIBUTE, '')
}

// Read back off the document rather than calling isDesktop() again, so the
// stylesheet and the render tree can never disagree about which mode we are in.
export function hasNativeVibrancy(): boolean {
  if (typeof document === 'undefined') return false

  return document.documentElement.hasAttribute(NATIVE_VIBRANCY_ATTRIBUTE)
}
