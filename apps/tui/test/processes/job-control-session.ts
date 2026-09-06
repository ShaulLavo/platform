import { runInteractive } from '@/host/interactive'
import { makeTestServer } from '../server'
import { createTestSettingsSession } from '../factories/session'

const server = await makeTestServer()
const session = createTestSettingsSession(server)
let unsubscribeSettings: (() => void) | undefined
const unsubscribeSession = session.subscribe(() => {
  const state = session.getSnapshot()
  if (state.kind !== 'ready' || unsubscribeSettings) return
  unsubscribeSettings = state.owner.subscribe(() => {
    if (state.owner.readSettingsMirror()['editor.fontSize'] !== 24) return
    process.stdout.write('\nTUI_SETTINGS_SAVED\n')
    unsubscribeSettings?.()
  })
})
try {
  await runInteractive(session, true)
  const state = session.getSnapshot()
  if (state.kind === 'ready') {
    process.stdout.write(`\nTUI_CLOSED ${JSON.stringify(state.owner.readSettingsMirror())}\n`)
  }
} finally {
  unsubscribeSession()
  unsubscribeSettings?.()
  session.dispose()
  await session.flush()
  await server.cleanup()
}
process.exit()
