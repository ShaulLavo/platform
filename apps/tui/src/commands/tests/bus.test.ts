import { createError } from 'evlog'
import { createCommandBus } from '@/commands/state/bus'
import { createFocusRegistry } from '@/commands/state/focus'
import { createCommandHarness } from '../../../test/commands'
import { expect, test } from '../../../test/fixtures'

test('palette excludes missing handlers, shows exact disabled reasons, and tracks completed commands', async () => {
  let finish: (value: boolean) => void = () => undefined
  const completion = new Promise<boolean>((resolve) => {
    finish = resolve
  })
  const harness = createCommandHarness({
    handlers: {
      'workspace.showSettings': { run: () => completion },
      'workspace.showQuickAccess': {
        disabledReason: () => 'Select a project first.',
        run: () => false,
      },
    },
  })
  try {
    const capture = harness.bus.capture('palette')
    expect(capture.list().map((row) => row.command.id)).toEqual([
      'workspace.showSettings',
      'workspace.showQuickAccess',
    ])
    expect(capture.inspect('workspace.showQuickAccess')).toMatchObject({
      status: 'disabled',
      reason: 'Select a project first.',
    })
    const ticket = capture.dispatch('workspace.showSettings')
    expect(ticket.claimed).toBe(true)
    expect(harness.executed).toEqual([])
    finish(true)
    expect(await ticket.completion).toEqual({ status: 'handled' })
    expect(harness.executed).toEqual(['workspace.showSettings'])
  } finally {
    harness.dispose()
  }
})

test('captured commands retain the original widget and refuse an environment change', async () => {
  const targets: unknown[] = []
  const harness = createCommandHarness({
    handlers: {
      'workspace.showSettings': {
        run: (context) => {
          targets.push(context.target?.token)
        },
      },
    },
  })
  try {
    const capture = harness.bus.capture('palette')
    const overlay = harness.focus.register({
      ...harness.scope,
      id: 'palette',
      area: 'command-palette',
      overlay: true,
      textEntry: true,
      focus: () => true,
      isFocused: () => true,
    })
    harness.focus.activate(overlay.token)
    await capture.dispatch('workspace.showSettings').completion
    expect(targets).toEqual([harness.target.token])
    harness.focus.setScope({ ...harness.scope, environmentId: 'environment-b' })
    expect(await capture.dispatch('workspace.showSettings').completion).toMatchObject({
      status: 'disabled',
    })
    expect(targets).toHaveLength(1)
  } finally {
    harness.dispose()
  }
})

test('failed async commands report their failure without becoming recents', async () => {
  const error = createError({
    message: 'Write failed',
    why: 'The server refused the write.',
    fix: 'Reconnect and retry.',
  })
  const harness = createCommandHarness({
    handlers: { 'settings.edit': { run: () => Promise.reject(error) } },
  })
  try {
    expect(await harness.bus.capture().dispatch('settings.edit').completion).toEqual({
      status: 'failed',
      error,
    })
    expect(harness.errors).toEqual([error])
    expect(harness.executed).toEqual([])
  } finally {
    harness.dispose()
  }
})

test('unmounting a surface removes its commands from the palette', () => {
  const harness = createCommandHarness({ handlers: {} })
  try {
    const registration = harness.bus.registerHandlers({ 'settings.edit': { run: () => undefined } })
    expect(
      harness.bus
        .capture()
        .list()
        .map((row) => row.command.id),
    ).toEqual(['settings.edit'])
    registration.unregister()
    expect(harness.bus.capture().list()).toEqual([])
  } finally {
    harness.dispose()
  }
})

test.for([{ asynchronous: true }, { asynchronous: false }])(
  'a completion callback failure settles the command as failed ($asynchronous)',
  async ({ asynchronous }) => {
    const error = createError({
      message: 'Command recording failed',
      why: 'The command recorder could not persist the completed command.',
      fix: 'Check the recorder storage.',
    })
    const reported: unknown[] = []
    const focus = createFocusRegistry({
      screen: 'settings',
      environmentId: 'test',
      projectId: null,
    })
    const bus = createCommandBus({
      focus,
      handlers: {
        'workspace.reconnect': { run: () => (asynchronous ? Promise.resolve(true) : true) },
      },
      onExecuted: () => {
        throw error
      },
      onError: (error) => reported.push(error),
    })
    expect(await bus.capture().dispatch('workspace.reconnect').completion).toEqual({
      status: 'failed',
      error,
    })
    expect(reported).toEqual([error])
    bus.dispose()
    focus.dispose()
  },
)

test.for([{ rejects: true }, { rejects: false }])(
  'disposing the command bus retires captures and late callbacks ($rejects)',
  async ({ rejects }) => {
    const pending = Promise.withResolvers<boolean>()
    const error = createError({
      message: 'Connection failed',
      why: 'The connection closed.',
      fix: 'Reconnect.',
    })
    const harness = createCommandHarness({
      handlers: { 'workspace.reconnect': { run: () => pending.promise } },
    })
    const capture = harness.bus.capture()
    const ticket = capture.dispatch('workspace.reconnect')
    expect(ticket.claimed).toBe(true)
    expect(capture.inspect('workspace.reconnect').status).toBe('ready')
    harness.bus.dispose()
    expect(capture.inspect('workspace.reconnect').status).toBe('unavailable')
    const late = capture.dispatch('workspace.reconnect')
    expect(late.claimed).toBe(false)
    expect(await late.completion).toMatchObject({ status: 'disabled' })
    expect(harness.bus.capture().dispatch('workspace.reconnect').claimed).toBe(false)
    if (rejects) pending.reject(error)
    else pending.resolve(true)
    expect(await ticket.completion).toEqual(
      rejects ? { status: 'failed', error } : { status: 'handled' },
    )
    expect(harness.executed).toEqual([])
    expect(harness.errors).toEqual([])
    harness.dispose()
  },
)

test('a failing error reporter cannot reject a failed command ticket', async () => {
  const error = createError({
    message: 'Connection failed',
    why: 'The connection closed.',
    fix: 'Reconnect.',
  })
  const focus = createFocusRegistry({ screen: 'settings', environmentId: 'test', projectId: null })
  const bus = createCommandBus({
    focus,
    handlers: { 'workspace.reconnect': { run: () => Promise.reject(error) } },
    onError: () => {
      throw error
    },
  })
  expect(await bus.capture().dispatch('workspace.reconnect').completion).toEqual({
    status: 'failed',
    error,
  })
  bus.dispose()
  focus.dispose()
})
