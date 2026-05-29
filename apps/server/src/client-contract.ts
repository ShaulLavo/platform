import type { App } from './app'

/**
 * Public RPC contract surface consumed by the web client via Eden treaty.
 *
 * This is the only server type the web app depends on. Importing it through a
 * dedicated `server/client-contract` entry point — rather than the package
 * root — keeps the client/server boundary explicit: server internals can
 * change freely as long as this Eden route type is preserved.
 */
export type { App }
