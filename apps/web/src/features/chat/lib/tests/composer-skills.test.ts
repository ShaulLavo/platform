import { providerInstanceIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { expect, test } from '../../../../../test/fixtures'

import {
  composerCommandHint,
  composerCommandLabel,
  composerCommandReplacement,
  composerSkillLabel,
  composerSkillReplacement,
  fetchProviderCommandCatalog,
  providerCommandCatalogKeys,
  providerCommandCatalogQueryOptions,
} from '@/features/chat/lib/composer-skills'

/**
 * Driven through the real client against the real server. The point is the
 * route itself: a client that builds a URL the server does not expose comes back
 * as a plain 404, never as the catalog asserted here. Codex is the subject
 * because it has no listing path, so the read answers before any adapter work
 * happens — no CLI is spawned by these tests.
 */
const codex = v.parse(providerInstanceIdSchema, 'codex')
const missing = v.parse(providerInstanceIdSchema, 'not-a-provider')

test('a provider with no listing path answers with an empty catalog', async ({ client }) => {
  void client

  expect(await fetchProviderCommandCatalog(codex, null)).toEqual({
    commands: [],
    providerInstanceId: 'codex',
    skills: [],
    supported: false,
  })
})

test('an unavailable provider answers with an empty catalog instead of an error', async ({
  client,
}) => {
  void client

  expect(await fetchProviderCommandCatalog(missing, '/tmp/some-project')).toEqual({
    commands: [],
    providerInstanceId: 'not-a-provider',
    skills: [],
    supported: false,
  })
})

test('the query is keyed by project, and stays off until a menu opens', ({ client }) => {
  void client

  const idle = providerCommandCatalogQueryOptions({
    cwd: '/tmp/project-a',
    enabled: false,
    providerInstanceId: codex,
  })
  const open = providerCommandCatalogQueryOptions({
    cwd: '/tmp/project-b',
    enabled: true,
    providerInstanceId: codex,
  })

  expect(idle.enabled).toBe(false)
  expect(open.enabled).toBe(true)
  expect(idle.queryKey).not.toEqual(open.queryKey)
  expect(open.queryKey).toEqual(providerCommandCatalogKeys.catalog(codex, '/tmp/project-b'))
})

test('a query with no provider selected never runs', ({ client }) => {
  void client

  expect(
    providerCommandCatalogQueryOptions({ cwd: null, enabled: true, providerInstanceId: null })
      .enabled,
  ).toBe(false)
})

test('committing a row types the trigger, the name, and one separating blank', () => {
  const skill = { enabled: true, name: 'web-design' }
  const command = { argumentHint: '<path>', description: 'Review a file', name: 'review' }

  expect(composerSkillReplacement(skill)).toBe('$web-design ')
  expect(composerSkillLabel(skill)).toBe('$web-design')
  expect(composerCommandReplacement(command)).toBe('/review ')
  expect(composerCommandLabel(command)).toBe('/review')
})

test('a command row shows its argument hint beside its description', () => {
  expect(
    composerCommandHint({ argumentHint: '<path>', description: 'Review', name: 'review' }),
  ).toBe('<path> — Review')
  expect(composerCommandHint({ description: 'Review', name: 'review' })).toBe('Review')
  expect(composerCommandHint({ argumentHint: '<path>', name: 'review' })).toBe('<path>')
  expect(composerCommandHint({ name: 'review' })).toBe('')
})
