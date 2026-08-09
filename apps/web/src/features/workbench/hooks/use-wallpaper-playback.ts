import { useEffect, type RefObject } from 'react'

// A full-screen wallpaper video keeps decoding and recompositing every frame
// even when the app is completely idle, which is the single largest source of
// idle GPU load in the workbench. Pause it whenever the window is not on
// screen: macOS Chrome/WebKit report minimised, backgrounded and fully occluded
// windows through visibilitychange, so this covers every "nobody is looking"
// case without freezing the wallpaper while the window is merely unfocused.
export function useWallpaperPlayback(videoRef: RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    const sync = () => {
      const video = videoRef.current
      if (!video) return

      if (document.visibilityState === 'hidden') {
        video.pause()
        return
      }

      // play() rejects if the element is detached or the source went away; the
      // wallpaper is decorative, so there is nothing to recover.
      void video.play().catch(() => {})
    }

    sync()
    document.addEventListener('visibilitychange', sync)

    return () => document.removeEventListener('visibilitychange', sync)
  }, [videoRef])
}
