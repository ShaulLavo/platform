import { useEffect, type RefObject } from 'react'

type MediaElement = HTMLImageElement | HTMLVideoElement

export function useMediaBlobUrl<T extends MediaElement>(
  blob: Blob | null | undefined,
  mediaRef: RefObject<T | null>,
  fallbackUrl?: string,
) {
  useEffect(() => {
    const element = mediaRef.current
    if (!element) return

    if (!blob) {
      restoreMediaSource(element, fallbackUrl)
      return
    }

    const objectUrl = URL.createObjectURL(blob)
    element.src = objectUrl

    return () => releaseMediaObjectUrl(element, objectUrl, fallbackUrl)
  }, [blob, fallbackUrl, mediaRef])
}

function releaseMediaObjectUrl(
  element: MediaElement,
  objectUrl: string,
  fallbackUrl: string | undefined,
) {
  restoreMediaSource(element, fallbackUrl)
  URL.revokeObjectURL(objectUrl)
}

function restoreMediaSource(element: MediaElement, fallbackUrl: string | undefined) {
  if (fallbackUrl) {
    element.src = fallbackUrl
    return
  }

  element.removeAttribute('src')
}
