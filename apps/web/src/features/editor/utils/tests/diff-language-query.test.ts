import { createSplitProjection, createTextDiff } from '@singapor/diff'
import { describe, expect, it } from 'vitest'

import { diffQueryTargetAt } from '@/features/editor/utils/diff-language-query'
import { createDiffPositionMap } from '@/features/editor/utils/diff-position-map'

// The gate deciding whether a point in a diff may become a language-server question. Every refusal
// here is a wrong answer that does not get shown.

const OLD = 'const a = 1\nconst b = 2\nconst c = 3\n'
const NEW = 'const a = 1\nconst B = 22\nconst c = 3\n'

describe('diffQueryTargetAt', () => {
  it('reconstructs the file text exactly, which is what lets the gate ever open', () => {
    // The premise under everything else here. `DiffFile.newLines` keeps a trailing empty element
    // for the final newline, so joining it returns the file byte for byte. If that stopped being
    // true the comparison below would never match and the feature would ship inert and silent
    // rather than broken and loud — the worst of the available failures.
    const file = createTextDiff({
      newFile: { path: 'repo/a.ts', text: NEW },
      oldFile: { path: 'repo/a.ts', text: OLD },
    })

    expect(file.newLines.join('\n')).toBe(NEW)
  })

  it('asks when the new side is exactly what the owning editor holds', () => {
    const { map, newText, offsetOf } = setUp()

    const target = diffQueryTargetAt({
      map,
      newText,
      offset: offsetOf('addition') + 6,
      ownedText: newText,
    })

    expect(target).toEqual({ kind: 'ask', position: { character: 6, line: 1 } })
  })

  it('refuses when the file has been edited since the diff was taken', () => {
    // The case the comparison exists for. An edit ABOVE the hover shifts every line below it, so
    // the position we would send names different code than the one under the pointer.
    const { map, newText, offsetOf } = setUp()

    const target = diffQueryTargetAt({
      map,
      newText,
      offset: offsetOf('addition') + 6,
      ownedText: `// a line added since\n${newText}`,
    })

    expect(target).toEqual({ kind: 'unavailable' })
  })

  it('refuses when nothing has the file open', () => {
    const { map, newText, offsetOf } = setUp()

    const target = diffQueryTargetAt({
      map,
      newText,
      offset: offsetOf('addition') + 6,
      ownedText: null,
    })

    expect(target).toEqual({ kind: 'unavailable' })
  })

  it('names the old side, so a caller can disable rather than silently answer nothing', () => {
    const { map, newText, offsetOf } = setUp({ side: 'old' })

    const target = diffQueryTargetAt({
      map,
      newText,
      offset: offsetOf('deletion'),
      ownedText: newText,
    })

    expect(target).toEqual({ kind: 'old-side' })
  })

  it('refuses a separator even when everything else lines up', () => {
    const long = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join('\n')
    const { map, newText, offsetOf } = setUp({
      newText: `${long.replace('line 40', 'changed')}\n`,
      oldText: `${long}\n`,
    })

    const target = diffQueryTargetAt({ map, newText, offset: offsetOf('hunk'), ownedText: newText })

    expect(target).toEqual({ kind: 'unavailable' })
  })
})

function setUp({
  newText = NEW,
  oldText = OLD,
  side = 'new',
}: { newText?: string; oldText?: string; side?: 'new' | 'old' } = {}) {
  const file = createTextDiff({
    newFile: { path: 'repo/a.ts', text: newText },
    oldFile: { path: 'repo/a.ts', text: oldText },
  })
  const projection = createSplitProjection(file)
  const rows = side === 'old' ? projection.leftRows : projection.rightRows

  return {
    map: createDiffPositionMap(rows, file.newLines),
    newText: file.newLines.join('\n'),
    offsetOf(type: string) {
      const index = rows.findIndex((row) => row.type === type)
      expect(index, `no ${type} row`).toBeGreaterThanOrEqual(0)

      return rows.slice(0, index).reduce((offset, row) => offset + row.text.length + 1, 0)
    },
  }
}
