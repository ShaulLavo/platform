import { describe, expect, it } from 'vitest'

import { documentTokenForPath, pathForDocumentToken } from '@/features/address/utils/document-token'
import { emptyAddress, formatAddress, parseAddress } from '@/features/address/utils/grammar'
import { compareSavedDocumentId } from '@/features/editor/compare-saved-document'
import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { checkpointDiffDocumentId, snapshotDiffDocumentId } from '@/features/git/diff-document'
import { refDocumentId } from '@/features/git/ref-document'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'
import { settingsDocumentId } from '@/features/settings/settings-document'
import type { ThreadId } from '@workspace/contracts'

const ROOT = '/repo'
const OLD_OID = 'a'.repeat(40)
const NEW_OID = 'b'.repeat(40)
const THREAD = 'thread-9f3a1c2e-77b0-4d51-9a2e-0c8f1b6d4a10' as ThreadId

function token(path: string) {
  const result = documentTokenForPath(ROOT, path)
  if (result.kind !== 'token') throw new Error(`expected a token, got ${result.kind}`)

  return result.token
}

function roundTrip(path: string) {
  const parsed = pathForDocumentToken(ROOT, token(path))
  if (parsed.kind !== 'path') throw new Error(`expected a path, got ${parsed.kind}`)

  return parsed.path
}

describe('files, compare-saved, refs and the search buffer', () => {
  it('round-trips a file', () => {
    expect(token(`${ROOT}/apps/web/src/main.tsx`)).toBe('f/apps/web/src/main.tsx')
    expect(roundTrip(`${ROOT}/apps/web/src/main.tsx`)).toBe(`${ROOT}/apps/web/src/main.tsx`)
  })

  it('round-trips a compare-saved document', () => {
    const path = compareSavedDocumentId(`${ROOT}/src/App.tsx`)

    expect(token(path)).toBe('c/src/App.tsx')
    expect(roundTrip(path)).toBe(path)
  })

  it('round-trips a git-ref document, a kind the plan never names', () => {
    const path = refDocumentId({ path: `${ROOT}/src/a.ts`, ref: 'refs/heads/main' })

    expect(token(path)).toBe('r/refs%2Fheads%2Fmain/src/a.ts')
    expect(roundTrip(path)).toBe(path)
  })

  it('drops the encoded absolute root from the search buffer', () => {
    expect(token(searchBufferDocumentId(ROOT))).toBe('s')
    expect(roundTrip(searchBufferDocumentId(ROOT))).toBe(searchBufferDocumentId(ROOT))
  })

  it('refuses a search buffer belonging to another workspace', () => {
    expect(documentTokenForPath(ROOT, searchBufferDocumentId('/other'))).toMatchObject({
      kind: 'unaddressable',
    })
  })
})

describe('snapshot diffs', () => {
  const diff = {
    newObjectId: NEW_OID,
    oldObjectId: OLD_OID,
    path: `${ROOT}/src/app.ts`,
    staged: false,
  }

  it('collapses a percent-encoded JSON id into a readable token', () => {
    const path = snapshotDiffDocumentId(diff as Parameters<typeof snapshotDiffDocumentId>[0])

    expect(token(path)).toBe(`d/worktree/${OLD_OID}..${NEW_OID},s=modified/src/app.ts`)
    expect(token(path).length).toBeLessThan(path.length / 2)
  })

  it('keeps `status` and `oldPath`, which the app cannot re-derive', () => {
    const renamed = snapshotDiffDocumentId({
      ...diff,
      oldPath: `${ROOT}/src/old.ts`,
    } as Parameters<typeof snapshotDiffDocumentId>[0])

    expect(token(renamed)).toContain('s=renamed')
    expect(token(renamed)).toContain('r=src%2Fold.ts')
    expect(roundTrip(renamed)).toBe(renamed)
  })

  it('marks a missing side with `_` and round-trips an added file', () => {
    const added = snapshotDiffDocumentId({
      newObjectId: NEW_OID,
      oldFileMissing: true,
      path: `${ROOT}/src/new.ts`,
      staged: false,
    } as Parameters<typeof snapshotDiffDocumentId>[0])

    expect(token(added)).toContain(`_..${NEW_OID}`)
  })

  // The server validates object ids as 40-64 hex; a fixed-width-40 grammar would
  // reject every id from a SHA-256 repository.
  it('accepts SHA-256 object ids', () => {
    const sha256 = 'c'.repeat(64)
    expect(pathForDocumentToken(ROOT, `d/worktree/${sha256}..${sha256}/a.ts`).kind).toBe('path')
  })

  it('rejects a revision naming nothing, and a malformed one', () => {
    expect(pathForDocumentToken(ROOT, 'd/worktree/_.._/a.ts')).toMatchObject({ kind: 'rejected' })
    expect(pathForDocumentToken(ROOT, 'd/worktree/zzz..zzz/a.ts')).toMatchObject({
      kind: 'rejected',
    })
    expect(pathForDocumentToken(ROOT, 'd/bogus/a..b/a.ts')).toMatchObject({ kind: 'rejected' })
  })

  it('reports branch diffs as unavailable rather than rejecting them', () => {
    expect(pathForDocumentToken(ROOT, 'd/branch/main...feature')).toMatchObject({
      kind: 'unavailable',
    })
  })
})

describe('checkpoint diffs', () => {
  const base = { fromTurnCount: 3, threadId: THREAD, toTurnCount: 5 }

  it('round-trips file scope', () => {
    const path = checkpointDiffDocumentId({
      ...base,
      filePath: `${ROOT}/src/a.ts`,
      path: `${ROOT}/src/a.ts`,
      scope: 'file',
    })

    expect(token(path)).toBe(`k/${THREAD}/3..5/src/a.ts`)
    expect(roundTrip(path)).toBe(path)
  })

  it('round-trips thread scope, whose path is synthetic', () => {
    const path = checkpointDiffDocumentId({
      ...base,
      path: 'checkpoint-thread-5',
      scope: 'thread',
    })

    expect(token(path)).toBe(`k/${THREAD}/3..5`)
    expect(roundTrip(path)).toBe(path)
  })

  it('round-trips turn scope', () => {
    const path = checkpointDiffDocumentId({
      ...base,
      path: 'checkpoint-turn-5',
      scope: 'turn',
    })

    expect(token(path)).toBe(`k/${THREAD}/3..5!turn`)
    expect(roundTrip(path)).toBe(path)
  })

  // The real measurement, against the plan's mistaken "622 -> ~100": the plan cites
  // the snapshot encoder and quotes the checkpoint's length.
  it('is dramatically shorter than the encoded id it replaces', () => {
    const path = checkpointDiffDocumentId({
      ...base,
      filePath: `${ROOT}/apps/web/src/keymap/commands.ts`,
      path: `${ROOT}/apps/web/src/keymap/commands.ts`,
      scope: 'file',
    })

    expect(path.length).toBeGreaterThan(300)
    expect(token(path).length).toBeLessThan(100)
  })

  it('rejects a turn range that runs backwards', () => {
    expect(pathForDocumentToken(ROOT, `k/${THREAD}/9..2`)).toMatchObject({ kind: 'rejected' })
  })
})

describe('what has no token', () => {
  it('cannot encode a conflict document', () => {
    expect(documentTokenForPath(ROOT, conflictDiffDocumentId('conflict-1'))).toMatchObject({
      kind: 'unaddressable',
    })
  })

  it('routes settings to the overlay slot rather than a tab token', () => {
    expect(documentTokenForPath(ROOT, settingsDocumentId())).toMatchObject({
      kind: 'overlay',
      overlay: 'settings',
    })
  })

  it('cannot encode a document outside the workspace', () => {
    expect(documentTokenForPath(ROOT, '/elsewhere/a.ts')).toMatchObject({ kind: 'unaddressable' })
  })
})

describe('hostile input', () => {
  // encodeURIComponent leaves `~` and `!` alone, and both are structural in the grammar.
  it('escapes the tab separator and the turn marker inside a filename', () => {
    expect(token(`${ROOT}/a~b!c.ts`)).toBe('f/a%7Eb%21c.ts')
    expect(roundTrip(`${ROOT}/a~b!c.ts`)).toBe(`${ROOT}/a~b!c.ts`)
  })

  it('round-trips spaces, unicode and reserved characters', () => {
    for (const name of ['a b.ts', 'ünïcödé.ts', 'a#b.ts', 'a?b.ts', 'a%20b.ts']) {
      expect(roundTrip(`${ROOT}/${name}`)).toBe(`${ROOT}/${name}`)
    }
  })

  it('degrades instead of throwing on a malformed percent-escape', () => {
    expect(() => pathForDocumentToken(ROOT, 'f/a%E0%A4%A')).not.toThrow()
    expect(pathForDocumentToken(ROOT, 'f/a%E0%A4%A')).toMatchObject({ kind: 'rejected' })
  })

  it('refuses a token that would escape the workspace', () => {
    expect(pathForDocumentToken(ROOT, 'f/../../etc/passwd')).toMatchObject({ kind: 'rejected' })
  })

  it('rejects an unknown token kind rather than guessing', () => {
    expect(pathForDocumentToken(ROOT, 'zzz/a.ts')).toMatchObject({ kind: 'rejected' })
    expect(pathForDocumentToken(ROOT, '')).toMatchObject({ kind: 'rejected' })
  })
})

// The blind spot that let a critical bug through: every test above goes
// documentTokenForPath -> pathForDocumentToken directly, never through the URL. A
// token whose internal encoding the path parser destroys round-trips perfectly in
// isolation and restores the wrong document in the app.
describe('tokens survive the whole URL, not just the codec', () => {
  function throughUrl(path: string) {
    const result = documentTokenForPath(ROOT, path)
    if (result.kind !== 'token') throw new Error(`expected a token, got ${result.kind}`)

    const href = formatAddress({
      ...emptyAddress(),
      document: result.token,
      mode: 'workbench',
      workspace: 'repo',
    })
    const parsed = pathForDocumentToken(ROOT, parseAddress(href).document ?? '')
    if (parsed.kind !== 'path') throw new Error(`expected a path, got ${parsed.kind}`)

    return parsed.path
  }

  it('round-trips a git-ref whose ref contains slashes', () => {
    const path = refDocumentId({ path: `${ROOT}/src/a.ts`, ref: 'refs/heads/main' })

    expect(throughUrl(path)).toBe(path)
  })

  it('round-trips a file whose name contains a slash-encoded character', () => {
    expect(throughUrl(`${ROOT}/src/a b.ts`)).toBe(`${ROOT}/src/a b.ts`)
    expect(throughUrl(`${ROOT}/src/a~b!c.ts`)).toBe(`${ROOT}/src/a~b!c.ts`)
  })

  it('round-trips a renamed snapshot diff, whose oldPath rides in the revision segment', () => {
    const renamed = snapshotDiffDocumentId({
      newObjectId: NEW_OID,
      oldObjectId: OLD_OID,
      oldPath: `${ROOT}/src/old name.ts`,
      path: `${ROOT}/src/app.ts`,
      staged: false,
    } as Parameters<typeof snapshotDiffDocumentId>[0])

    expect(throughUrl(renamed)).toBe(renamed)
  })

  it('round-trips a file-scope checkpoint diff', () => {
    const path = checkpointDiffDocumentId({
      filePath: `${ROOT}/src/a.ts`,
      fromTurnCount: 3,
      path: `${ROOT}/src/a.ts`,
      scope: 'file',
      threadId: THREAD,
      toTurnCount: 5,
    })

    expect(throughUrl(path)).toBe(path)
  })
})

describe('status survives the round trip', () => {
  // `snapshotDiffDocumentId` re-derives status from which side is missing rather than
  // accepting one, so carrying `s=` means restoring the inputs that produce it.
  it.each(['deleted', 'untracked', 'modified'] as const)('round-trips %s', (status) => {
    const sides = {
      deleted: { newFileMissing: true },
      modified: {},
      untracked: { oldFileMissing: true },
    }[status]
    const path = snapshotDiffDocumentId({
      newObjectId: NEW_OID,
      oldObjectId: OLD_OID,
      path: `${ROOT}/src/app.ts`,
      staged: false,
      ...sides,
    } as Parameters<typeof snapshotDiffDocumentId>[0])

    expect(token(path)).toContain(`s=${status}`)
    expect(roundTrip(path)).toBe(path)
  })

  it('refuses to turn an arbitrary URL string into a git status', () => {
    const parsed = pathForDocumentToken(ROOT, `k/${THREAD}/1..2,s=notastatus/src/a.ts`)

    expect(parsed.kind).toBe('path')
    expect(parsed.kind === 'path' && parsed.path).not.toContain('notastatus')
  })
})
