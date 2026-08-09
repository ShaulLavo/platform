import { describe, expect, it } from 'vitest'
import type {
  InteractionMode,
  ModelSelection,
  ProviderInstanceId,
  RuntimeMode,
} from '@workspace/contracts'
import { DEFAULT_CLAUDE_MODEL } from '../utils/claude-models'
import {
  claudeModelId,
  claudePermissionMode,
  claudeQueryOptions,
  claudeResumeSessionId,
} from '../utils/claude-query-options'

const CLAUDE_INSTANCE = 'claude' as ProviderInstanceId
const CODEX_INSTANCE = 'codex' as ProviderInstanceId

function modelSelection(overrides: Partial<ModelSelection> = {}): ModelSelection {
  return {
    model: 'claude-opus-5',
    providerInstanceId: CLAUDE_INSTANCE,
    ...overrides,
  }
}

function queryOptions(overrides: {
  interactionMode?: InteractionMode
  resumeCursor?: unknown
  runtimeMode: RuntimeMode
  sessionId?: string
}) {
  return claudeQueryOptions({
    abortController: new AbortController(),
    cwd: '/tmp/workspace',
    model: 'claude-opus-5',
    ...overrides,
  })
}

describe('claudePermissionMode', () => {
  const cases: Array<{ expected: string; interactionMode?: InteractionMode; mode: RuntimeMode }> = [
    { expected: 'default', mode: 'approval-required' },
    { expected: 'acceptEdits', mode: 'auto-accept-edits' },
    { expected: 'bypassPermissions', mode: 'full-access' },
    { expected: 'plan', interactionMode: 'plan', mode: 'approval-required' },
    { expected: 'plan', interactionMode: 'plan', mode: 'auto-accept-edits' },
    { expected: 'plan', interactionMode: 'plan', mode: 'full-access' },
    { expected: 'default', interactionMode: 'default', mode: 'approval-required' },
    { expected: 'acceptEdits', interactionMode: 'default', mode: 'auto-accept-edits' },
    { expected: 'bypassPermissions', interactionMode: 'default', mode: 'full-access' },
  ]

  for (const testCase of cases) {
    it(`maps ${testCase.mode}/${testCase.interactionMode ?? 'unset'} to ${testCase.expected}`, () => {
      const mode = claudePermissionMode({
        runtimeMode: testCase.mode,
        ...(testCase.interactionMode ? { interactionMode: testCase.interactionMode } : {}),
      })

      expect(mode).toBe(testCase.expected)
    })
  }
})

describe('claudeQueryOptions permission pairing', () => {
  const runtimeModes: RuntimeMode[] = ['approval-required', 'auto-accept-edits', 'full-access']
  const interactionModes: Array<InteractionMode | undefined> = [undefined, 'default', 'plan']

  for (const runtimeMode of runtimeModes) {
    for (const interactionMode of interactionModes) {
      it(`pairs the bypass flag with the mode for ${runtimeMode}/${interactionMode ?? 'unset'}`, () => {
        const options = queryOptions({
          runtimeMode,
          ...(interactionMode ? { interactionMode } : {}),
        })

        const bypassing = options.permissionMode === 'bypassPermissions'
        expect(options.allowDangerouslySkipPermissions).toBe(bypassing ? true : undefined)
        expect('allowDangerouslySkipPermissions' in options).toBe(bypassing)
      })
    }
  }

  it('never emits the bypass flag without the bypass mode', () => {
    const options = queryOptions({ runtimeMode: 'approval-required' })

    expect(options.permissionMode).toBe('default')
    expect(options.allowDangerouslySkipPermissions).toBeUndefined()
  })

  it('never emits the bypass mode without the bypass flag', () => {
    const options = queryOptions({ runtimeMode: 'full-access' })

    expect(options.permissionMode).toBe('bypassPermissions')
    expect(options.allowDangerouslySkipPermissions).toBe(true)
  })
})

describe('claudeQueryOptions', () => {
  it('emits the streaming and settings defaults', () => {
    const abortController = new AbortController()
    const options = claudeQueryOptions({
      abortController,
      cwd: '/tmp/workspace',
      model: 'claude-opus-5',
      runtimeMode: 'full-access',
    })

    expect(options.cwd).toBe('/tmp/workspace')
    expect(options.model).toBe('claude-opus-5')
    expect(options.abortController).toBe(abortController)
    expect(options.includePartialMessages).toBe(true)
    expect(options.settingSources).toEqual(['user', 'project', 'local'])
    expect(options.systemPrompt).toEqual({ preset: 'claude_code', type: 'preset' })
  })

  it('leaves the environment untouched so the macOS keychain lookup keeps working', () => {
    const options = queryOptions({ runtimeMode: 'full-access' })

    expect('env' in options).toBe(false)
  })

  it('omits resume and canUseTool when they are not supplied', () => {
    const options = queryOptions({ runtimeMode: 'full-access' })

    expect('resume' in options).toBe(false)
    expect('canUseTool' in options).toBe(false)
  })

  it('resumes from a session cursor', () => {
    const options = queryOptions({ resumeCursor: 'session-abc', runtimeMode: 'full-access' })

    expect(options.resume).toBe('session-abc')
  })

  it('names a fresh session with the minted id', () => {
    const options = queryOptions({ runtimeMode: 'full-access', sessionId: 'session-new' })

    expect(options.sessionId).toBe('session-new')
    expect('resume' in options).toBe(false)
  })

  /** The SDK rejects the pair outright unless `forkSession` rides along. */
  it('never emits resume and sessionId together', () => {
    const options = queryOptions({
      resumeCursor: 'session-abc',
      runtimeMode: 'full-access',
      sessionId: 'session-new',
    })

    expect(options.resume).toBe('session-abc')
    expect('sessionId' in options).toBe(false)
  })

  it('ignores non-string and blank resume cursors', () => {
    expect('resume' in queryOptions({ resumeCursor: null, runtimeMode: 'full-access' })).toBe(false)
    expect('resume' in queryOptions({ resumeCursor: '  ', runtimeMode: 'full-access' })).toBe(false)
    expect('resume' in queryOptions({ resumeCursor: 42, runtimeMode: 'full-access' })).toBe(false)
  })

  it('forwards canUseTool when supplied', async () => {
    const canUseTool = async () => ({ behavior: 'allow' }) as const
    const options = claudeQueryOptions({
      abortController: new AbortController(),
      canUseTool,
      cwd: '/tmp/workspace',
      model: 'claude-opus-5',
      runtimeMode: 'approval-required',
    })

    expect(options.canUseTool).toBe(canUseTool)
  })
})

describe('claudeResumeSessionId', () => {
  it('accepts a non-empty string and rejects everything else', () => {
    expect(claudeResumeSessionId('session-abc')).toBe('session-abc')
    expect(claudeResumeSessionId('  session-abc  ')).toBe('session-abc')
    expect(claudeResumeSessionId('')).toBeNull()
    expect(claudeResumeSessionId(undefined)).toBeNull()
    expect(claudeResumeSessionId({ sessionId: 'session-abc' })).toBeNull()
  })
})

describe('claudeModelId', () => {
  it('uses the selected model when the instance matches', () => {
    const model = claudeModelId({
      modelSelection: modelSelection(),
      providerInstanceId: CLAUDE_INSTANCE,
    })

    expect(model).toBe('claude-opus-5')
  })

  it('falls back to the default model when the selection targets another provider', () => {
    const model = claudeModelId({
      modelSelection: modelSelection({ model: 'gpt-5.5', providerInstanceId: CODEX_INSTANCE }),
      providerInstanceId: CLAUDE_INSTANCE,
    })

    expect(model).toBe(DEFAULT_CLAUDE_MODEL)
  })

  it('falls back to the default model when the slug is blank', () => {
    const model = claudeModelId({
      modelSelection: modelSelection({ model: '   ' }),
      providerInstanceId: CLAUDE_INSTANCE,
    })

    expect(model).toBe(DEFAULT_CLAUDE_MODEL)
  })

  it('appends the [1m] suffix when the 1M context window is selected', () => {
    const model = claudeModelId({
      modelSelection: modelSelection({ options: { contextWindow: '1m' } }),
      providerInstanceId: CLAUDE_INSTANCE,
    })

    expect(model).toBe('claude-opus-5[1m]')
  })

  it('reads the 1M selection from the array-shaped options too', () => {
    const model = claudeModelId({
      modelSelection: modelSelection({
        options: [{ id: 'contextWindow', value: '1M' }] as unknown as ModelSelection['options'],
      }),
      providerInstanceId: CLAUDE_INSTANCE,
    })

    expect(model).toBe('claude-opus-5[1m]')
  })

  it('omits the suffix for every other context-window selection', () => {
    const selections: Array<ModelSelection['options']> = [
      undefined,
      {},
      { contextWindow: '200k' },
      { contextWindow: 1_000_000 },
    ]

    for (const options of selections) {
      const model = claudeModelId({
        modelSelection: modelSelection(options ? { options } : {}),
        providerInstanceId: CLAUDE_INSTANCE,
      })

      expect(model).toBe('claude-opus-5')
    }
  })

  it('does not double-suffix a slug that already carries [1m]', () => {
    const model = claudeModelId({
      modelSelection: modelSelection({
        model: 'claude-opus-5[1m]',
        options: { contextWindow: '1m' },
      }),
      providerInstanceId: CLAUDE_INSTANCE,
    })

    expect(model).toBe('claude-opus-5[1m]')
  })

  it('never suffixes the fallback model on an instance mismatch', () => {
    const model = claudeModelId({
      modelSelection: modelSelection({
        options: { contextWindow: '1m' },
        providerInstanceId: CODEX_INSTANCE,
      }),
      providerInstanceId: CLAUDE_INSTANCE,
    })

    expect(model).toBe(DEFAULT_CLAUDE_MODEL)
  })
})
