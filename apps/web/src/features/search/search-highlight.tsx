export function HighlightedPreview({
  preview,
  query,
  range,
  replacementText,
}: {
  preview: string
  query: string
  range?: { end: number; start: number } | null
  replacementText?: string
}) {
  const highlight = range ? previewRangeHighlight(preview, range) : previewHighlight(preview, query)
  if (!highlight) {
    return (
      <span className='block max-w-full overflow-hidden text-ellipsis whitespace-nowrap'>
        {preview}
      </span>
    )
  }

  if (replacementText !== undefined) {
    return (
      <span className='block max-w-full overflow-hidden text-ellipsis whitespace-nowrap'>
        {highlight.before}
        <mark className='inline-block max-w-full overflow-hidden rounded-sm bg-red-500/15 px-0.5 align-bottom text-ellipsis whitespace-nowrap text-red-950 line-through decoration-red-700/70 dark:bg-red-500/20 dark:text-red-100'>
          {highlight.match}
        </mark>
        <mark className='ml-0.5 inline-block max-w-full overflow-hidden rounded-sm bg-emerald-500/15 px-0.5 align-bottom text-ellipsis whitespace-nowrap text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-100'>
          {replacementText}
        </mark>
        {highlight.after}
      </span>
    )
  }

  return (
    <span className='block max-w-full overflow-hidden text-ellipsis whitespace-nowrap'>
      {highlight.before}
      <mark className='inline-block max-w-full overflow-hidden rounded-sm bg-yellow-200/80 px-0.5 align-bottom text-ellipsis whitespace-nowrap text-yellow-950 dark:bg-yellow-500/30 dark:text-yellow-100'>
        {highlight.match}
      </mark>
      {highlight.after}
    </span>
  )
}

function previewRangeHighlight(preview: string, range: { end: number; start: number }) {
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
