import { describe, expect, it } from 'vitest'

import { languageIdForFilePath } from '@/features/editor/utils/file-path'
import { lspLanguageIdForPath } from '@/features/editor/utils/lsp-language-id'

describe('lspLanguageIdForPath', () => {
  it('renames the JSX-bearing extensions the grammar table calls plain ts/js', () => {
    expect(languageIdForFilePath('/a/b/Row.tsx')).toBe('typescript')
    expect(lspLanguageIdForPath('/a/b/Row.tsx')).toBe('typescriptreact')
    expect(lspLanguageIdForPath('/a/b/Row.jsx')).toBe('javascriptreact')
  })

  it('leaves everything else to the editor id', () => {
    expect(lspLanguageIdForPath('/a/b/plugin.ts')).toBeUndefined()
    expect(lspLanguageIdForPath('/a/b/main.js')).toBeUndefined()
    expect(lspLanguageIdForPath('/a/b/README.md')).toBeUndefined()
    expect(lspLanguageIdForPath('/a/b/Makefile')).toBeUndefined()
  })

  it('reads the last segment, so a dotted directory is not an extension', () => {
    expect(lspLanguageIdForPath('file:///a/b.tsx/plugin.ts')).toBeUndefined()
    expect(lspLanguageIdForPath('file:///a/my.dir/Row.tsx')).toBe('typescriptreact')
  })
})
