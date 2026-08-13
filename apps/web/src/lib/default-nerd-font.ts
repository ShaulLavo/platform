import { serverUrl } from '@/lib/client'

const DEFAULT_NERD_FONT_ID = 'JetBrainsMono'

/**
 * The family a fetched Nerd Font is registered under.
 *
 * Derived from the id rather than the vendor's display name (`JetBrainsMono` the
 * id ships as `JetBrains Mono Nerd Font`), because nothing maps between the two
 * and the id is the only name the client and server share. Since this module
 * both registers the face and writes the stack, the derived name is what makes
 * them agree.
 */
function nerdFontFamily(fontId: string): string {
  return `${fontId} Nerd Font`
}

export const DEFAULT_NERD_FONT_FAMILY = nerdFontFamily(DEFAULT_NERD_FONT_ID)

/**
 * The CSS stack for a font setting, which may be a Nerd Font id or a family the
 * user typed.
 *
 * Both cases fall out of the same two candidates. For a Nerd Font id the first
 * entry matches the face this module registers — deliberately named from the id,
 * because the id is the only name the client and server agree on (`JetBrainsMono`
 * the id is `JetBrains Mono Nerd Font` the family, and nothing maps between
 * them). For a family the user typed, the first entry simply does not match and
 * the second does, against whatever is installed locally.
 *
 * The generic fallbacks stay last so a font that will not download degrades to a
 * monospace face rather than to the browser's proportional default.
 */
export function fontStack(value: string): string {
  return `"${value} Nerd Font", "${value}", ui-monospace, SFMono-Regular, monospace`
}

/** Derived, not written out again: one definition of what a font stack is. */
export const DEFAULT_MONO_FONT_STACK = fontStack(DEFAULT_NERD_FONT_ID)
export const DEFAULT_MONO_FONT_VARIABLE = '--font-mono'

type CssVariableTarget = {
  readonly style: {
    setProperty(name: string, value: string): void
  }
}

type FontSetTarget = {
  add(fontFace: FontFace): void
}

type FontFaceConstructor = new (
  family: string,
  source: string | BufferSource,
  descriptors?: FontFaceDescriptors,
) => FontFace

type DefaultNerdFontOptions = {
  FontFace?: FontFaceConstructor | null
  fetcher?: typeof fetch
  fonts?: FontSetTarget | null
  root?: CssVariableTarget | null
  url?: string
}

export async function loadDefaultNerdFont(options: DefaultNerdFontOptions = {}) {
  return loadNerdFont(DEFAULT_NERD_FONT_ID, options)
}

/**
 * Fetches one Nerd Font by id, registers it, and points `--font-mono` at it.
 *
 * The stack is applied before the fetch as well as after, so the editor renders
 * in a monospace face immediately instead of waiting on a download that may take
 * a while the first time — the server subsets and caches on demand.
 */
export async function loadNerdFont(fontId: string, options: DefaultNerdFontOptions = {}) {
  const root = options.root ?? documentRoot()
  const family = nerdFontFamily(fontId)
  applyMonoFontStack(root, fontStack(fontId))

  const FontFaceClass = options.FontFace ?? globalThis.FontFace
  const fonts = options.fonts ?? documentFonts()
  if (!FontFaceClass || !fonts) return false

  try {
    const fontData = await fetchDefaultFontData({ ...options, url: options.url ?? fontUrl(fontId) })
    if (!fontData) return false

    const fontFace = new FontFaceClass(family, fontData, {
      display: 'swap',
      style: 'normal',
      weight: '400',
    })
    await fontFace.load()
    fonts.add(fontFace)
    applyMonoFontStack(root, fontStack(fontId))

    return true
  } catch {
    return false
  }
}

function applyMonoFontStack(root: CssVariableTarget | null, stack: string) {
  root?.style.setProperty(DEFAULT_MONO_FONT_VARIABLE, stack)
}

function fontUrl(fontId: string) {
  const baseUrl = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`

  return new URL(`fonts/${encodeURIComponent(fontId)}`, baseUrl).href
}

export function fontPreviewUrl(fontId: string, text: string) {
  const baseUrl = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`
  const url = new URL(`fonts/${encodeURIComponent(fontId)}/preview`, baseUrl)
  url.searchParams.set('text', text)

  return url.href
}

async function fetchDefaultFontData(options: DefaultNerdFontOptions) {
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(options.url ?? fontUrl(DEFAULT_NERD_FONT_ID), {
    credentials: 'omit',
  })
  if (!response.ok) return null

  return response.arrayBuffer()
}

function documentRoot() {
  if (typeof document === 'undefined') return null

  return document.documentElement
}

function documentFonts() {
  if (typeof document === 'undefined') return null

  return document.fonts
}
