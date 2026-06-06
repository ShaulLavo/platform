import { describe, expect, it } from 'vitest'

import { mutationKeys } from '../mutation-keys'

describe('mutationKeys', () => {
  it('uses stable keys for repository-wide git mutations', () => {
    expect(mutationKeys.commit('repo')).toEqual(['git', 'mutation', 'commit', 'repo'])
    expect(mutationKeys.checkout('repo')).toEqual(['git', 'mutation', 'checkout', 'repo'])
    expect(mutationKeys.sync('repo')).toEqual(['git', 'mutation', 'sync', 'repo'])
  })

  it('keeps bulk path order in multi-path mutation keys', () => {
    expect(mutationKeys.stageMany(['b.ts', 'a.ts'])).toEqual([
      'git',
      'mutation',
      'stage-many',
      'b.ts',
      'a.ts',
    ])
    expect(mutationKeys.discardStagedMany(['one', 'two'])).toEqual([
      'git',
      'mutation',
      'discard-staged-many',
      'one',
      'two',
    ])
  })
})
