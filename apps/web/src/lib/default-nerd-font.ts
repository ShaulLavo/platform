import { serverUrl } from '@/lib/client'

const DEFAULT_NERD_FONT_ID = 'JetBrainsMono'
export const DEFAULT_NERD_FONT_FAMILY = 'JetBrains Mono Nerd Font'
export const DEFAULT_MONO_FONT_STACK = `"${DEFAULT_NERD_FONT_FAMILY}", "JetBrains Mono Variable", ui-monospace, SFMono-Regular, monospace`
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
  const root = options.root ?? documentRoot()
  applyDefaultMonoFontStack(root)

  const FontFaceClass = options.FontFace ?? globalThis.FontFace
  const fonts = options.fonts ?? documentFonts()
  if (!FontFaceClass || !fonts) return false

  try {
    const fontData = await fetchDefaultFontData(options)
    if (!fontData) return false

    const fontFace = new FontFaceClass(DEFAULT_NERD_FONT_FAMILY, fontData, {
      display: 'swap',
      style: 'normal',
      weight: '400',
    })
    await fontFace.load()
    fonts.add(fontFace)
    applyDefaultMonoFontStack(root)

    return true
  } catch {
    return false
  }
}

function applyDefaultMonoFontStack(root: CssVariableTarget | null = documentRoot()) {
  root?.style.setProperty(DEFAULT_MONO_FONT_VARIABLE, DEFAULT_MONO_FONT_STACK)
}

function defaultNerdFontUrl() {
  const baseUrl = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`
  return new URL(`fonts/${DEFAULT_NERD_FONT_ID}`, baseUrl).href
}

async function fetchDefaultFontData(options: DefaultNerdFontOptions) {
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(options.url ?? defaultNerdFontUrl(), { credentials: 'omit' })
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
