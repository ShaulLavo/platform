import * as v from 'valibot'

import { NO_WORKSPACE_SLUG } from '@/features/address/utils/slug'

/**
 * `/~<workspace-slug>/<mode>/<document-token>?<view params>#<position>`
 *
 * Path is identity, search is composition and filters, fragment is intra-document
 * position. The workspace segment always starts `~` so the flat top-level namespace
 * stays free — and that is load-bearing at the HTTP layer, not just tidiness: Vite
 * serves real files before its SPA fallback, and `apps/web/public/workbench/` exists,
 * so a bare `/workbench` route would be shadowed by a directory and never reach React.
 *
 * Every field is optional. An absent field means "defer to the remembered slice",
 * never "reset to default" — that rule is what lets a short link land somewhere sane
 * without flattening everything the URL does not mention.
 */

const WORKSPACE_PREFIX = '~'

export const ADDRESS_MODES = ['chat', 'workbench'] as const
export type AddressMode = (typeof ADDRESS_MODES)[number]

/**
 * A `strictObject` on purpose: this is the whitelist that makes the deny-list
 * structural. A store the encoder must never reach — the terminal command inbox, the
 * composer inbox — cannot be written into an `Address` even by mistake, because the
 * schema has no field to put it in.
 */
export const addressSchema = v.strictObject({
  bottom: v.nullable(v.picklist(['terminal', 'problems'])),
  /** Thread diff scope. Deliberately NOT `scope`: the rail owns no addressable scope. */
  diff: v.nullable(v.string()),
  document: v.nullable(v.string()),
  /** `log.*` — the log dashboard's filters, which persist nothing today. */
  logs: v.nullable(v.record(v.string(), v.string())),
  focus: v.nullable(
    v.strictObject({
      column: v.nullable(v.number()),
      endLine: v.nullable(v.number()),
      line: v.number(),
    }),
  ),
  mode: v.nullable(v.picklist(ADDRESS_MODES)),
  /** Unowned search keys, copied through byte-for-byte. See the dev-param note below. */
  passthrough: v.record(v.string(), v.string()),
  rail: v.nullable(v.picklist(['active', 'archived'])),
  /** `s.*` — the search buffer's query and flags. Never its replacement text. */
  search: v.nullable(v.record(v.string(), v.string())),
  settings: v.nullable(v.string()),
  side: v.nullable(v.picklist(['chat', 'files', 'git', 'logs', 'search'])),
  tabs: v.nullable(v.array(v.string())),
  tool: v.nullable(v.string()),
  workspace: v.nullable(v.string()),
})

export type Address = v.InferOutput<typeof addressSchema>

const OWNED_SEARCH_KEYS = new Set(['tabs', 'side', 'bottom', 'tool', 'rail', 'diff', 'settings'])
const LOGS_PREFIX = 'log.'
const SEARCH_PREFIX = 's.'

export function emptyAddress(): Address {
  return {
    bottom: null,
    diff: null,
    document: null,
    focus: null,
    logs: null,
    mode: null,
    passthrough: {},
    rail: null,
    search: null,
    settings: null,
    side: null,
    tabs: null,
    tool: null,
    workspace: null,
  }
}

/**
 * The URL is untrusted input parsed by a normalizing parser, never a schema that
 * throws. A garbage segment costs the field it names and nothing else.
 */
export function parseAddress(href: string): Address {
  const url = safeUrl(href)
  if (!url) return emptyAddress()

  // Segments stay RAW here. Only the workspace slug is decoded, because only the slug
  // is a plain value; a document token owns its own encoding and decodes per segment
  // in `document-token.ts`. Decoding the whole path first turned
  // `r/refs%2Fheads%2Fmain/src/a.ts` into `r/refs/heads/main/src/a.ts`, which then
  // split into the wrong fields and restored the wrong document.
  const segments = url.pathname.split('/').filter(Boolean)
  const [workspaceSegment, ...rest] = segments

  return {
    ...emptyAddress(),
    ...searchFields(url.searchParams),
    document: rest.slice(1).join('/') || null,
    focus: parseFocus(url.hash),
    mode: addressMode(rest[0]),
    workspace: workspaceSlugFromSegment(decodeOrEmpty(workspaceSegment ?? '')),
  }
}

export function serializeAddress(address: Address) {
  return {
    hash: serializeFocus(address.focus),
    pathname: serializePathname(address),
    search: serializeSearch(address),
  }
}

export function formatAddress(address: Address) {
  const { hash, pathname, search } = serializeAddress(address)

  return `${pathname}${search}${hash}`
}

function serializePathname(address: Address) {
  if (!address.workspace) return '/'

  const segments = [`${WORKSPACE_PREFIX}${encodeSlug(address.workspace)}`]
  if (address.mode) segments.push(address.mode)
  if (address.mode && address.document) segments.push(address.document)

  return `/${segments.join('/')}`
}

function serializeSearch(address: Address) {
  const params = new URLSearchParams()

  if (address.tabs?.length) params.set('tabs', address.tabs.join('~'))
  if (address.side) params.set('side', address.side)
  if (address.bottom) params.set('bottom', address.bottom)
  if (address.tool) params.set('tool', address.tool)
  if (address.rail) params.set('rail', address.rail)
  if (address.diff) params.set('diff', address.diff)
  // `!== null`, not truthiness: `?settings=` with an empty value is a real state —
  // the settings page open on no particular category — and dropping it as falsy lost
  // the whole tab on reload.
  if (address.settings !== null) params.set('settings', address.settings)
  for (const [key, value] of Object.entries(address.logs ?? {}))
    params.set(`${LOGS_PREFIX}${key}`, value)
  for (const [key, value] of Object.entries(address.search ?? {}))
    params.set(`${SEARCH_PREFIX}${key}`, value)
  for (const [key, value] of Object.entries(address.passthrough)) params.set(key, value)

  const search = params.toString()
  return search ? `?${search}` : ''
}

function searchFields(params: URLSearchParams) {
  const tabs = params.get('tabs')

  return {
    bottom: pick(params.get('bottom'), ['terminal', 'problems'] as const),
    diff: params.get('diff'),
    logs: prefixedGroup(params, LOGS_PREFIX),
    search: prefixedGroup(params, SEARCH_PREFIX),
    passthrough: passthroughFrom(params),
    rail: pick(params.get('rail'), ['active', 'archived'] as const),
    settings: params.get('settings'),
    side: pick(params.get('side'), ['chat', 'files', 'git', 'logs', 'search'] as const),
    tabs: tabs ? tabs.split('~').filter(Boolean) : null,
    tool: params.get('tool'),
  }
}

/**
 * Four dev params are read by code that runs outside React's lifecycle, and two of
 * them are read LATE — `editorPerfLayout` during every editor render, and `decode` on
 * the first editor's idle callback. A canonicalizing rewrite that dropped them would
 * change behaviour mid-session with no error and no log, so every key the serializer
 * does not own is copied through untouched.
 */
function passthroughFrom(params: URLSearchParams) {
  const passthrough: Record<string, string> = {}

  for (const [key, value] of params) {
    if (OWNED_SEARCH_KEYS.has(key)) continue
    if (key.startsWith(LOGS_PREFIX) || key.startsWith(SEARCH_PREFIX)) continue

    passthrough[key] = value
  }

  return passthrough
}

/** A prefixed family collapses to one record, so the grammar owns the group not the keys. */
function prefixedGroup(params: URLSearchParams, prefix: string) {
  const group: Record<string, string> = {}

  for (const [key, value] of params) {
    if (!key.startsWith(prefix)) continue

    group[key.slice(prefix.length)] = value
  }

  return Object.keys(group).length > 0 ? group : null
}

function workspaceSlugFromSegment(segment: string | undefined) {
  if (!segment?.startsWith(WORKSPACE_PREFIX)) return null

  return segment.slice(WORKSPACE_PREFIX.length) || null
}

function addressMode(segment: string | undefined): AddressMode | null {
  return pick(segment ?? null, ADDRESS_MODES)
}

/** `#L484`, `#L21,9`, `#L484-L520`. Never sent to a server, never in a referer. */
function parseFocus(hash: string) {
  const match = /^#L(\d+)(?:,(\d+))?(?:-L(\d+))?$/.exec(hash)
  if (!match) return null

  const line = Number(match[1])
  if (!Number.isInteger(line) || line < 1) return null

  return {
    column: match[2] ? Number(match[2]) : null,
    endLine: match[3] ? Number(match[3]) : null,
    line,
  }
}

function serializeFocus(focus: Address['focus']) {
  if (!focus) return ''

  // Column and range are independent: `#L10,5-L20` is a real position and the parser
  // already reads it. Emitting them exclusively silently dropped the column on every
  // ranged go-to-definition.
  const column = focus.column ? `,${focus.column}` : ''
  const end = focus.endLine ? `-L${focus.endLine}` : ''

  return `#L${focus.line}${column}${end}`
}

function pick<const T extends readonly string[]>(value: string | null, allowed: T) {
  return value && (allowed as readonly string[]).includes(value) ? (value as T[number]) : null
}

/** `-` is not a legal directory leaf, so `/~-` cannot collide with a real workspace. */
function encodeSlug(slug: string) {
  if (slug === NO_WORKSPACE_SLUG) return slug

  return encodeURIComponent(slug).replaceAll('~', '%7E')
}

function decodeOrEmpty(segment: string) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function safeUrl(href: string) {
  try {
    return new URL(href, 'http://localhost')
  } catch {
    return null
  }
}
