import type { PlatformDatabase } from './client'
import { environmentIdentity, type EnvironmentIdentity } from './schema'
import { createStructuredError } from '../observability/structured-errors'

export function readEnvironmentIdentity(database: PlatformDatabase): EnvironmentIdentity {
  const rows = database.select().from(environmentIdentity).limit(2).all()
  const [identity] = rows
  if (rows.length === 1 && identity) return identity

  throw createStructuredError({
    code: 'db.ENVIRONMENT_IDENTITY_INVALID',
    status: 500,
    message: 'The platform database must contain exactly one environment identity',
    why: 'Migration 10 creates one durable identity. Missing or multiple rows indicate invalid database state.',
    fix: 'Stop the server and remove the invalid development database, then restart to create a new environment.',
    internal: { identityRowCount: rows.length },
  })
}
