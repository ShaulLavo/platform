const FENCE_REGEX = /^\s{0,3}(`{3,}|~{3,})/
const BLOCKQUOTE_REGEX = /^\s{0,3}(?:>\s?)+/
const ATX_HEADING_REGEX = /^\s{0,3}#{1,6}\s+/
const THEMATIC_BREAK_REGEX = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/
/** Capturing, so `split` hands back the code spans interleaved with the prose. */
const CODE_SPAN_REGEX = /(`+[^`]*`+)/
const IMAGE_REGEX = /!\[([^\]]*)\]\([^)]*\)/g
const LINK_REGEX = /\[([^\]]*)\]\([^)]*\)/g
const LEADING_BACKTICKS_REGEX = /^`+/
const TRAILING_BACKTICKS_REGEX = /`+$/
const EMPHASIS_REGEXES = [
  /~~([^~]+)~~/g,
  /\*\*\*([^*]+)\*\*\*/g,
  /\*\*([^*]+)\*\*/g,
  /\*([^*]+)\*/g,
  /___([^_]+)___/g,
  /__([^_]+)__/g,
  // Word-boundary guarded so snake_case identifiers survive intact.
  /(?<!\w)_([^_]+)_(?!\w)/g,
] as const

/**
 * Assistant text is markdown source, so a plain "Copy" that handed over the
 * source would paste asterisks into every non-markdown destination. This
 * reduces it to what the reader sees.
 *
 * Deliberately conservative: it only removes markers, never reflows or
 * reorders, and anything it does not recognise (tables, reference links, raw
 * HTML) survives verbatim rather than being mangled.
 */
export function markdownToPlainText(markdown: string) {
  const output: string[] = []
  let openFence: string | null = null

  for (const line of markdown.split('\n')) {
    const fence = fenceMarker(line)
    if (openFence !== null) {
      const closed = closesFence(fence, openFence)
      openFence = closed ? null : openFence
      // Fenced code is already literal — only the fence lines themselves go.
      if (!closed) output.push(line)
      continue
    }
    if (fence !== null) {
      openFence = fence
      continue
    }

    appendProseLine(output, plainTextLine(line))
  }

  return output.join('\n').trim()
}

/**
 * Markers that vanish entirely — a thematic break, a dropped fence — would
 * otherwise leave blank-line runs the source never had. Markdown collapses any
 * such run to a single paragraph break, so matching that is what the reader
 * actually saw. Fenced code never reaches here, so its blank lines are safe.
 */
function appendProseLine(output: string[], line: string) {
  if (line !== '') {
    output.push(line)
    return
  }
  if (output.at(-1) === '') return

  output.push('')
}

function fenceMarker(line: string) {
  return FENCE_REGEX.exec(line)?.[1] ?? null
}

function closesFence(fence: string | null, openFence: string) {
  if (fence === null) return false
  if (fence[0] !== openFence[0]) return false

  return fence.length >= openFence.length
}

function plainTextLine(line: string) {
  const unquoted = line.replace(BLOCKQUOTE_REGEX, '')
  if (THEMATIC_BREAK_REGEX.test(unquoted)) return ''

  return stripInlineMarkers(unquoted.replace(ATX_HEADING_REGEX, ''))
}

function stripInlineMarkers(text: string) {
  return text
    .split(CODE_SPAN_REGEX)
    .map((part, index) => (index % 2 === 1 ? unwrapCodeSpan(part) : stripLinksAndEmphasis(part)))
    .join('')
}

function unwrapCodeSpan(span: string) {
  return span.replace(LEADING_BACKTICKS_REGEX, '').replace(TRAILING_BACKTICKS_REGEX, '')
}

function stripLinksAndEmphasis(text: string) {
  // Images first: the link pattern would match an image's `[alt](url)` tail and
  // strand its leading `!`.
  const withoutLinks = text.replace(IMAGE_REGEX, '$1').replace(LINK_REGEX, '$1')

  return EMPHASIS_REGEXES.reduce((value, regex) => value.replace(regex, '$1'), withoutLinks)
}
