import { summarizeDiagnostics } from '@singapor/lsp-plugin'

import { createEditorLanguageServerStatusSource } from '@/features/editor/state/language-server-status-source'
import { expect, test } from '../../../../../test/fixtures'

test('aggregates readiness and preserves diagnostics from healthy lanes', () => {
  const source = createEditorLanguageServerStatusSource()
  source.setServers(['primary', 'secondary'])

  expect(source.getSnapshot()).toMatchObject({ diagnostics: null, status: 'loading' })
  source.setServerStatus('primary', 'ready')
  expect(source.getSnapshot().status).toBe('loading')

  source.setServerDiagnostics('primary', summary('primary'))
  source.setServerDiagnostics('secondary', summary('secondary'))
  expect(source.getSnapshot().status).toBe('ready')
  expect(messages(source)).toEqual(['primary', 'secondary'])

  source.setServerStatus('secondary', 'error')
  expect(source.getSnapshot().status).toBe('ready')
  expect(messages(source)).toEqual(['primary'])
})

test('reports error only after every eligible lane errors', () => {
  const source = createEditorLanguageServerStatusSource()
  source.setServers(['first', 'second'])
  source.setServerStatus('first', 'error')

  expect(source.getSnapshot().status).toBe('loading')
  source.setServerStatus('second', 'error')
  expect(source.getSnapshot().status).toBe('error')
  source.setServers([])
  expect(source.getSnapshot().status).toBe('idle')
})

function summary(message: string) {
  return summarizeDiagnostics('file:///test.ts', 1, [
    {
      message,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ])
}

function messages(source: ReturnType<typeof createEditorLanguageServerStatusSource>) {
  return source.getSnapshot().diagnostics?.diagnostics.map((item) => item.message) ?? []
}
