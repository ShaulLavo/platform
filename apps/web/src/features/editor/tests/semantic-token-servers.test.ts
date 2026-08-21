import { createSemanticTokenStyles } from '@singapor/core/syntax'
import { describe, expect, it } from 'vitest'

import {
  SEMANTIC_TOKEN_SERVER_IDS,
  semanticTokenProfileFor,
} from '@/features/editor/utils/semantic-token-servers'

/**
 * The legends all six shortlist servers advertised, recorded verbatim.
 *
 * Probed on this machine (aarch64 macOS, 2026-08-21) by spawning each binary
 * over stdio with `Content-Length` framing and sending one `initialize` carrying
 * the block `semanticTokensCapabilityForServer` builds, then reading
 * `capabilities.semanticTokensProvider` out of the reply. Re-probe rather than
 * trusting these arrays after a server upgrade — a legend is a property of one
 * version, and terraform-ls's is a property of what *this client* declared.
 *
 * They are fixtures rather than a live spawn because this assertion is about
 * *this repo's alias table*, and a test that needed six language servers
 * installed would simply not run on most machines. The live counterpart is
 * `semantic-token-conformance.test.ts`, which spawns each binary and skips only
 * when one is absent.
 */
const PROBED_LEGENDS: Readonly<Record<string, readonly string[]>> = {
  // rust-analyzer 1.88.0 — 57 types, 38 of them non-standard.
  rust: [
    'comment',
    'decorator',
    'enumMember',
    'enum',
    'function',
    'interface',
    'keyword',
    'macro',
    'method',
    'namespace',
    'number',
    'operator',
    'parameter',
    'property',
    'string',
    'struct',
    'typeParameter',
    'variable',
    'type',
    'angle',
    'arithmetic',
    'attributeBracket',
    'attribute',
    'bitwise',
    'boolean',
    'brace',
    'bracket',
    'builtinAttribute',
    'builtinType',
    'character',
    'colon',
    'comma',
    'comparison',
    'constParameter',
    'const',
    'deriveHelper',
    'derive',
    'dot',
    'escapeSequence',
    'formatSpecifier',
    'generic',
    'invalidEscapeSequence',
    'label',
    'lifetime',
    'logical',
    'macroBang',
    'parenthesis',
    'procMacro',
    'punctuation',
    'selfKeyword',
    'selfTypeKeyword',
    'semicolon',
    'static',
    'toolModule',
    'typeAlias',
    'union',
    'unresolvedReference',
  ],
  // gopls v0.21.0 — 14 types. Its custom axis is modifiers, not types.
  gopls: [
    'namespace',
    'type',
    'typeParameter',
    'parameter',
    'variable',
    'function',
    'method',
    'macro',
    'keyword',
    'comment',
    'string',
    'number',
    'operator',
    'label',
  ],
  // zls 0.16.0 — 28 types. `escapeSequence` at index 19 is inserted *between*
  // `string` and `number`, not appended, which is the case that breaks any
  // decoder assuming indices 0-22 are the standard set.
  zls: [
    'namespace',
    'type',
    'class',
    'enum',
    'interface',
    'struct',
    'typeParameter',
    'parameter',
    'variable',
    'property',
    'enumMember',
    'event',
    'function',
    'method',
    'macro',
    'keyword',
    'modifier',
    'comment',
    'string',
    'escapeSequence',
    'number',
    'regexp',
    'operator',
    'decorator',
    'errorTag',
    'builtin',
    'label',
    'keywordLiteral',
  ],
  // terraform-ls — 9 types, and only 9 because it intersects its own vocabulary
  // against the `tokenTypes` this client declares.
  terraform: [
    'enumMember',
    'function',
    'keyword',
    'number',
    'parameter',
    'property',
    'string',
    'type',
    'variable',
  ],
  // typescript-language-server — 12 types, `member` the only non-standard one.
  typescript: [
    'class',
    'enum',
    'interface',
    'namespace',
    'typeParameter',
    'type',
    'parameter',
    'variable',
    'enumMember',
    'property',
    'function',
    'member',
  ],
  // clangd (Apple 15) — 21 entries with duplicates at several indices, which is
  // why nothing anywhere inverts a legend into a name-to-index map.
  clangd: [
    'variable',
    'variable',
    'parameter',
    'function',
    'method',
    'function',
    'property',
    'variable',
    'class',
    'interface',
    'enum',
    'enumMember',
    'type',
    'type',
    'unknown',
    'namespace',
    'typeParameter',
    'concept',
    'type',
    'macro',
    'comment',
  ],
}

/**
 * Coverage, not vibes.
 *
 * A token name that resolves to nothing paints nothing, and what shows through
 * is the syntactic colour that was already there — so by eye a legend two thirds
 * on the floor is indistinguishable from one that worked. This is the assertion
 * that would have caught 38 of rust-analyzer's 57 types dropping silently, and
 * it reads the same resolver the paint layer reads.
 */
describe('semantic token alias coverage', () => {
  for (const [serverId, legend] of Object.entries(PROBED_LEGENDS)) {
    it(`resolves or deliberately declines every name ${serverId} advertises`, () => {
      const profile = semanticTokenProfileFor(serverId)
      const styles = createSemanticTokenStyles({ scopeAliases: profile.scopeAliases })

      const unexplained = [...new Set(legend)].filter(
        (name) => styles.resolve(name) === null && !(name in profile.uncovered),
      )

      expect(unexplained).toEqual([])
    })

    it(`paints nothing for the names ${serverId} is declared not to cover`, () => {
      const profile = semanticTokenProfileFor(serverId)
      const styles = createSemanticTokenStyles({ scopeAliases: profile.scopeAliases })

      // The other direction, and it is the half that rots: a name listed as
      // uncovered which later starts resolving is a stale entry claiming a gap
      // that closed, and the list is only worth reading if every row is live.
      for (const name of Object.keys(profile.uncovered)) {
        expect(styles.resolve(name)).toBeNull()
      }
    })
  }

  it('leaves nothing uncovered that the server is confident about', () => {
    const profile = semanticTokenProfileFor('rust')

    // The two rust-analyzer names this app refuses on purpose: both mean the
    // server does *not* know, and confident colour over either would be a lie
    // the diagnostics layer then has to argue with.
    expect(profile.uncovered.unresolvedReference).toBe('server-uncertain')
    expect(profile.uncovered.invalidEscapeSequence).toBe('server-uncertain')
  })

  it('maps every alias onto a scope the theme actually resolves', () => {
    const styles = createSemanticTokenStyles({})

    for (const serverId of SEMANTIC_TOKEN_SERVER_IDS) {
      const { scopeAliases } = semanticTokenProfileFor(serverId)
      for (const [name, scope] of Object.entries(scopeAliases)) {
        // An alias pointing at a scope with no rule is worse than no alias: it
        // reads as covered and paints nothing.
        expect({ name, resolved: styles.resolve(scope) !== null, scope, serverId }).toMatchObject({
          resolved: true,
        })
      }
    }
  })
})
