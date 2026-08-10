import { describe, expect, it } from 'vitest'
import { baseRefCandidates, baseRefChoiceId, buildBaseRefChoices } from '../utils/base-refs'

describe('baseRefCandidates', () => {
  it('prefers the recorded base, then the remote default, then the conventions', () => {
    const candidates = baseRefCandidates({
      configuredBase: 'origin/release',
      defaultBranch: 'origin/develop',
      headBranch: 'session/a',
      remoteNames: ['origin'],
    })

    expect(candidates).toEqual(['release', 'develop', 'main', 'master'])
  })

  it('never proposes the branch being diffed as its own base', () => {
    const candidates = baseRefCandidates({
      configuredBase: null,
      defaultBranch: 'main',
      headBranch: 'main',
      remoteNames: ['origin'],
    })

    expect(candidates).toEqual(['master'])
  })

  it('strips the longest matching remote prefix', () => {
    const candidates = baseRefCandidates({
      configuredBase: 'upstream/main',
      defaultBranch: null,
      headBranch: 'feature',
      remoteNames: ['up', 'upstream'],
    })

    expect(candidates).toEqual(['main', 'master'])
  })
})

describe('buildBaseRefChoices', () => {
  it('pairs a local branch with its remote and keeps remote-only branches', () => {
    const choices = buildBaseRefChoices(
      ['main', 'feature'],
      ['origin/main', 'origin/release'],
      ['origin'],
    )

    expect(choices).toEqual([
      { id: 'local:main', label: 'main', local: 'main', remote: 'origin/main' },
      { id: 'local:feature', label: 'feature', local: 'feature', remote: null },
      {
        id: 'remote:origin/release',
        label: 'origin/release',
        local: null,
        remote: 'origin/release',
      },
    ])
  })

  it('resolves a ref to the choice that carries it on either side', () => {
    const choices = buildBaseRefChoices(['main'], ['origin/main'], ['origin'])

    expect(baseRefChoiceId(choices, 'origin/main')).toBe('local:main')
    expect(baseRefChoiceId(choices, 'nope')).toBe(null)
    expect(baseRefChoiceId(choices, null)).toBe(null)
  })
})
