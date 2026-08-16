/**
 * Shared harness for tests that drive the real in-process server.
 *
 * Every app built here owns an in-memory database, so a test run never opens,
 * migrates, or WAL-locks the developer's real `~/.platform/fs-metadata.sqlite`.
 * `createMetadataDatabase` refuses the default path from a test process, so a
 * call site that forgets to inject fails loudly instead of leaking.
 */
import { closeApp, createApp, type App, type AppOptions } from '../src/app'
import { createMetadataDatabase, type MetadataDatabaseHandle } from '../src/db/client'

const openApps: App[] = []
const openDatabases: MetadataDatabaseHandle[] = []

export function createTestDatabase(): MetadataDatabaseHandle {
  const database = createMetadataDatabase({ databasePath: ':memory:' })
  openDatabases.push(database)

  return database
}

/**
 * Builds the real app over a fresh in-memory database. An explicit
 * `orchestration.database` or `metadataDatabase` in `options` still wins — some
 * suites drive the orchestration store directly and hand in their own handle.
 */
export function createTestApp(options: AppOptions = {}): App {
  const database = createTestDatabase()
  const app = createApp({
    ...options,
    metadataDatabase: options.metadataDatabase ?? database,
    orchestration: { database: database.db, ...options.orchestration },
  })
  openApps.push(app)

  return app
}

/** Closes every app and database this module handed out. Call from `afterEach`. */
export async function closeTestApps(): Promise<void> {
  await Promise.all(openApps.splice(0).map((app) => closeApp(app)))
  for (const database of openDatabases.splice(0)) {
    database.close()
  }
}
