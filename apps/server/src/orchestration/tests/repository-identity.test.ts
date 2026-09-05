import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { repositoryIdentitySchema } from '@workspace/contracts'
import { normalizeGitRemoteUrl } from '../../git/utils/remote-url'
import {
  projectIdForRepository,
  repositoryKey,
  worktreeIdForCheckout,
} from '../utils/repository-ids'
import vectors from './factories/repository-identity-vectors.json'

describe('repository remote identity', () => {
  it.each([
    'https://github.com/OpenAI/Platform.git',
    'http://GITHUB.COM/openai/platform/',
    'ssh://git@GitHub.com/OpenAI/Platform.git',
    'git://github.com/openai/platform.git/',
    'git@github.com:OpenAI/Platform.git',
    '  git@GITHUB.COM:OpenAI/Platform.git/  ',
    'https://user:password@github.com/openai/platform.git',
    'ssh://git@github.com:22/openai/platform',
  ])('normalizes %s to the same repository', (remote) => {
    expect(normalizeGitRemoteUrl(remote)).toBe('github.com/openai/platform')
  })

  it.each([
    '/local/repository',
    'file:///local/repository',
    'github.com',
    'https://',
    'git@github.com:',
  ])('refuses a remote without a supported host and repository path: %s', (remote) => {
    expect(normalizeGitRemoteUrl(remote)).toBeNull()
  })
})

// Expected digests and UUIDs come from Python hashlib.sha256 and uuid.uuid5.
it.each(vectors)('locks independent UUIDv5 vectors for $source identity', (vector) => {
  const identity = v.parse(repositoryIdentitySchema, {
    source: vector.source,
    canonical: vector.canonical,
    remoteName: 'origin',
    host: 'github.com',
    path: 'openai/platform',
  })
  const key = repositoryKey(identity)
  expect(key).toBe(vector.repositoryKey)
  expect(projectIdForRepository(key)).toBe(vector.projectId)
  for (const checkout of vector.worktrees) {
    expect(worktreeIdForCheckout(key, checkout.canonicalPath)).toBe(checkout.worktreeId)
  }
  expect(vector.worktrees[0]?.worktreeId).not.toBe(vector.worktrees[1]?.worktreeId)
})
