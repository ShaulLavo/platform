/**
 * Runtime entry point for test harnesses that drive the real server in-process.
 *
 * The package root (`server`) stays type-only so application code can never
 * accidentally import the Bun-native runtime (bun:sqlite, Bun.spawn). Tests opt
 * in explicitly through `server/testing`, and run under the Bun runtime
 * (`bun --bun vitest`) where those Bun APIs resolve.
 */
export { closeApp, createApp } from './app'
export type { App, AppOptions } from './app'
export { createMetadataDatabase } from './db/client'
export { NerdFontService } from './fonts/service'
export { MockProviderAdapter } from './provider/adapters/mock'
export { ProviderAdapterRegistry } from './provider/provider-adapter-registry'
export type { MetadataDatabaseHandle, PlatformDatabase } from './db/client'

export { testSettingsOptions } from './settings/testing'
