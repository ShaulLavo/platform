import { settingsSnapshotSchema, settingsWriteRequestSchema } from '@workspace/contracts'
import { Elysia } from 'elysia'
import * as v from 'valibot'
import { toSse } from '../sse'
import type { SettingsStore } from './store'
import { settingsErrors } from './structured-errors'

const SETTINGS_HEARTBEAT_MS = 15_000

const targetSchema = v.optional(v.picklist(['user', 'workspace'] as const), 'user')

const rawQuerySchema = v.object({ target: targetSchema })

const rawWriteSchema = v.object({
  target: targetSchema,
  text: v.string(),
  baseRevision: v.optional(v.string()),
})

/**
 * Five routes, all GET or POST — the CORS layer allows exactly GET/POST/OPTIONS,
 * so PUT and PATCH fail preflight from the web client.
 *
 * Request bodies are deliberately not validated by Elysia. It collapses any
 * schema failure into its generic VALIDATION code, which would strip the typed
 * `settings.*` error the store raises — the one carrying the status, the `why`
 * and the `fix` the page actually shows. Validation happens in the store, which
 * is also the only thing that can check scope and policy.
 */
export function settingsRoutes(settings: SettingsStore) {
  return new Elysia({ name: 'settings-routes' })
    .get('/settings', () => settings.snapshot(), { response: settingsSnapshotSchema })
    .post(
      '/settings/write',
      ({ body }) => settings.write(parse(settingsWriteRequestSchema, body)),
      {
        response: settingsSnapshotSchema,
      },
    )
    .get('/settings/events', ({ request }) =>
      toSse(settings.changes(request.signal), {
        event: () => 'settings',
        heartbeatMs: SETTINGS_HEARTBEAT_MS,
      }),
    )
    .get('/settings/raw', ({ query }) => settings.rawLayer(parse(rawQuerySchema, query).target))
    .post('/settings/raw', ({ body }) => {
      const request = parse(rawWriteSchema, body)

      return settings.writeRaw(request.target, request.text, request.baseRevision)
    })
}

function parse<TSchema extends v.GenericSchema>(
  schema: TSchema,
  input: unknown,
): v.InferOutput<TSchema> {
  const parsed = v.safeParse(schema, input)
  if (parsed.success) return parsed.output

  throw settingsErrors.WRITE_INVALID({
    key: 'request',
    reason: v.summarize(parsed.issues).replaceAll('\n', ' '),
  })
}
