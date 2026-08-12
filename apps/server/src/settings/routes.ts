import { settingsSchema } from '@workspace/contracts'
import { redactSettings } from './utils/redaction'
import { Elysia } from 'elysia'
import type { SettingsService } from './service'

/**
 * Two routes, one document. POST rather than PUT/PATCH because the app's CORS
 * layer only allows GET/POST/OPTIONS, so anything else fails preflight from the
 * web client.
 *
 * The body is deliberately left unvalidated at the route: Elysia collapses any
 * schema failure into its generic VALIDATION code, which would strip the typed
 * `settings.PATCH_INVALID` (with its own status, why, and fix) that the service
 * raises. The service is also the only validator the stored document has, so
 * routing every write through it keeps one rule in one place.
 */
export function settingsRoutes(settings: SettingsService) {
  return new Elysia({ name: 'settings-routes' })
    .get('/settings', () => settings.readForClient(), { response: settingsSchema })
    .post('/settings', ({ body }) => redactSettings(settings.update(body)), {
      response: settingsSchema,
    })
}
