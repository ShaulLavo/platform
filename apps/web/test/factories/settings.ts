import {
  DEFAULT_SETTING_VALUES,
  type SettingsSnapshot,
  type SettingsValues,
} from '@workspace/contracts'

type SettingsSnapshotInput = {
  readonly epoch?: string
  readonly sequence?: number
  readonly userRaw?: Readonly<Record<string, unknown>>
  readonly userRevision?: string
  readonly userText?: string
  readonly values?: Partial<SettingsValues>
  readonly workspaceRaw?: Readonly<Record<string, unknown>>
  readonly workspaceRevision?: string
  readonly workspaceText?: string
}

export function settingsSnapshot({
  epoch = 'settings-test',
  sequence = 0,
  userRaw = {},
  userRevision = 'user-revision',
  userText = '{}\n',
  values = {},
  workspaceRaw = {},
  workspaceRevision = 'workspace-revision',
  workspaceText = '{}\n',
}: SettingsSnapshotInput = {}): SettingsSnapshot {
  return {
    diagnostics: [],
    layers: [
      {
        file: settingsFile(userText, userRevision),
        id: 'user',
        present: Object.keys(userRaw).length > 0,
        raw: userRaw,
      },
      {
        file: settingsFile(workspaceText, workspaceRevision),
        id: 'workspace',
        present: Object.keys(workspaceRaw).length > 0,
        raw: workspaceRaw,
      },
      { id: 'policy', present: false, raw: {} },
    ],
    serverVersion: { epoch, sequence },
    values: { ...DEFAULT_SETTING_VALUES, ...values },
  }
}

function settingsFile(text: string, revision: string) {
  return { keyRanges: {}, parseErrors: [], revision, text }
}
