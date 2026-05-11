export function HighlightedPreview({
  preview,
  query,
  range,
}: {
  preview: string
  query: string
  range?: { end: number; start: number } | null
}) {
  const highlight = range
    ? previewRangeHighlight(preview, range)
    : previewHighlight(preview, query)
  if (!highlight) return <>{preview}</>

  return (
    <>
      {highlight.before}
      <mark className="rounded-sm bg-yellow-200/80 px-0.5 text-yellow-950 dark:bg-yellow-500/30 dark:text-yellow-100">
        {highlight.match}
      </mark>
      {highlight.after}
    </>
  )
}

function previewRangeHighlight(
  preview: string,
  range: { end: number; start: number }
) {
  if (range.start < 0 || range.end <= range.start) return null
  if (range.start >= preview.length) return null

  const end = Math.min(range.end, preview.length)
  return {
    after: preview.slice(end),
    before: preview.slice(0, range.start),
    match: preview.slice(range.start, end),
  }
}

function previewHighlight(preview: string, query: string) {
  if (!query) return null

  const normalizedPreview = preview.toLocaleLowerCase()
  const normalizedQuery = query.toLocaleLowerCase()
  const index = normalizedPreview.indexOf(normalizedQuery)
  if (index < 0) return null

  const end = index + query.length
  return {
    after: preview.slice(end),
    before: preview.slice(0, index),
    match: preview.slice(index, end),
  }
}
