/**
 * Regenerates `docs/settings-reference.md` from the registry.
 *
 * Generated rather than written, because a hand-maintained table of ~36 keys
 * with defaults and scopes is a table that is wrong within a month. Run `bun run settings:reference`
 * after changing `packages/contracts/src/settings/keys.ts`.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { SETTING_IDS, descriptorFor } from '../packages/contracts/src/index'

const SCOPE_NOTES: Record<string, string> = {
  application: 'user file only',
  machine: 'user file only, machine-specific',
  resource: 'user or workspace',
  window: 'user or workspace',
}

function table(ids: readonly string[]) {
  const rows = ids.map((id) => {
    const descriptor = descriptorFor(id as never)
    const flags = [
      descriptor.requiresRestart ? 'restart' : '',
      descriptor.readOnlyReason ? 'read-only' : '',
      descriptor.sensitive ? 'sensitive' : '',
    ].filter(Boolean)

    return `| \`${id}\` | \`${JSON.stringify(descriptor.default)}\` | ${descriptor.scope} | ${
      descriptor.description
    }${flags.length > 0 ? ` _(${flags.join(', ')})_` : ''} |`
  })

  return [
    '| Setting | Default | Scope | What it does |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

const byCategory = new Map<string, string[]>()
for (const id of SETTING_IDS) {
  const category = descriptorFor(id).category
  byCategory.set(category, [...(byCategory.get(category) ?? []), id])
}

const sections = [...byCategory]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([category, ids]) => `## ${category}\n\n${table(ids)}`)

const body = `> [!NOTE]
> Generated from the settings registry by \`bun scripts/generate-settings-reference.ts\`.
> Edit \`packages/contracts/src/settings/keys.ts\`, not this file.

# Settings reference

Settings live in \`~/.platform/settings.json\`. The file holds only what you have
changed, so anything absent takes the current build's default — which is what lets
a default improve without touching your file.

A workspace can carry its own \`.platform/settings.json\`. Only settings marked
**window** or **resource** can be set there: a workspace file ships inside a
cloned repository, so anything reaching process spawn, exec, env, or the keymap is
readable only from your own file.

Scopes: ${Object.entries(SCOPE_NOTES)
  .map(([scope, note]) => `**${scope}** — ${note}`)
  .join('; ')}.

Secrets — provider environment values — are **not** in this file. They live in
\`~/.platform/secrets.json\` with owner-only permissions, so the settings document
stays safe to read, share and export.

${sections.join('\n\n')}
`

const target = path.join(import.meta.dirname, '..', 'docs', 'settings-reference.md')
writeFileSync(target, body, 'utf8')
console.log(`wrote ${target} (${SETTING_IDS.length} settings)`)
