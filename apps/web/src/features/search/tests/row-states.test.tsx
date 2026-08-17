import { SearchMatchRow, SearchNameMatchRow } from '@/features/search/search-match-row'
import { expect, test } from '../../../../test/fixtures'
import { renderWithProviders } from '../../../../test/render'

const contentMatch = {
  column: 1,
  endColumn: 7,
  kind: 'content',
  line: 1,
  path: 'repo/src/app.ts',
  preview: 'needle here',
  previewStartColumn: 1,
  source: 'disk',
  type: 'file',
} as const

const nameMatch = {
  kind: 'name',
  path: 'repo/needle-file.ts',
  source: 'disk',
  type: 'file',
} as const

function renderContentRow(active?: boolean) {
  const { container } = renderWithProviders(
    <SearchMatchRow
      active={active}
      match={contentMatch}
      onOpenMatch={() => {}}
      query='needle'
      replaceQuery={null}
      replaceText=''
    />,
  )

  return container.firstElementChild as HTMLElement
}

function renderNameRow(active?: boolean) {
  // Each row gets its own container: the content row renders an inner "open
  // result" button, so a document-wide getByRole('button') is ambiguous once
  // both row types are on screen.
  const { container } = renderWithProviders(
    <SearchNameMatchRow active={active} match={nameMatch} onOpenMatch={() => {}} query='needle' />,
  )

  return container.firstElementChild as HTMLElement
}

// The content row is the majority row type in any results list and it carried
// no hover class at all before plan 041 — the pointer got no feedback on it.
test('every search row type reacts to the pointer', () => {
  expect(renderContentRow().className).toContain('hover:bg-row-hover')
  expect(renderNameRow().className).toContain('hover:bg-row-hover')
})

// Selected has to outrank hover. If both classes ever land on one element the
// hover paints over the selection, which is how the old /60-vs-/55 pair read as
// one color.
test('the selected row never also carries a hover class', () => {
  const content = renderContentRow(true)
  expect(content.className).toContain('bg-row-selected')
  expect(content.className).not.toContain('hover:bg-row-hover')

  const name = renderNameRow(true)
  expect(name.className).toContain('bg-row-selected')
  expect(name.className).not.toContain('hover:bg-row-hover')
})

// bg-muted is a surface token carrying --surface-opacity; hand-rolling a /NN on
// top of it is the pattern AGENTS.md forbids and the one this plan removed.
test('no row paints a raw surface opacity', () => {
  expect(renderContentRow().className).not.toMatch(/bg-muted\/\d+/)
  expect(renderContentRow(true).className).not.toMatch(/bg-muted\/\d+/)
  expect(renderNameRow().className).not.toMatch(/bg-muted\/\d+/)
})
