import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { SettingsSnapshot } from '@workspace/contracts'
import { describe, expect, it } from 'vitest'

import { SettingsStore } from '../../settings/store'

// TEMPORARY PROBE. Answers one question about the settings store on Linux: is
// the in-flight change delivered late, or never? The failing test sleeps a flat
// 400ms; this watches for 4s and records when each change actually lands.
// Reports through `expect.fail` because Vitest's console interception does not
// surface `console.log` from a passing test. Delete once the real fix lands.
function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

describe('linux settings watch probe', () => {
  it('reports when a change lands during a failing secret read', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'settings-watch-probe-'))
    const store = new SettingsStore({
      userFilePath: path.join(root, 'settings.json'),
      watch: true,
    })

    const started = Date.now()
    const delivered: string[] = []
    store.onChange((snapshot: SettingsSnapshot) => {
      delivered.push(
        `+${Date.now() - started}ms ${JSON.stringify(snapshot.values['keybindings.overrides'])}`,
      )
    })

    await mkdir(path.join(root, 'secrets.json'))
    await writeFile(
      path.join(root, 'settings.json'),
      '{ "keybindings.overrides": { "a.one": "Mod+1" } }',
      'utf8',
    )

    await delay(400)
    const atFourHundred = [...delivered]
    await delay(3_600)

    expect.fail(
      `SETTINGS ${JSON.stringify({
        platform: process.platform,
        atFourHundred,
        atFourSeconds: delivered,
      })}`,
    )
  })
})
