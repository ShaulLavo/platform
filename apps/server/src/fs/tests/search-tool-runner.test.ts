import { describe, expect, it } from 'vitest'

import { runToolLines, type SearchToolWarning } from '../search-tool-runner'

describe('search tool runner', () => {
  it('reports a tolerated failure to the caller instead of only the log', async () => {
    const warnings: SearchToolWarning[] = []

    const lines = await collect(
      runToolLines('sh', ['-c', 'echo found; echo denied >&2; exit 2'], undefined, [0], [2], {
        onWarning: (warning) => warnings.push(warning),
      }),
    )

    expect(lines).toEqual(['found'])
    expect(warnings).toEqual([
      { code: 2, command: 'sh', stderrTail: expect.stringContaining('denied') },
    ])
  })

  it('stays silent when the tool succeeds', async () => {
    const warnings: SearchToolWarning[] = []

    const lines = await collect(
      runToolLines('sh', ['-c', 'echo found'], undefined, [0], [2], {
        onWarning: (warning) => warnings.push(warning),
      }),
    )

    expect(lines).toEqual(['found'])
    expect(warnings).toEqual([])
  })

  it('still throws for an exit code that is not tolerated', async () => {
    await expect(
      collect(runToolLines('sh', ['-c', 'echo boom >&2; exit 3'], undefined, [0])),
    ).rejects.toMatchObject({ code: 'OPERATION_FAILED' })
  })
})

async function collect(lines: AsyncIterable<string>) {
  const result: string[] = []
  for await (const line of lines) result.push(line)

  return result
}
