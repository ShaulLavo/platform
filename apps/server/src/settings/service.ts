import { settingsPatchSchema, settingsSchema, type Settings } from '@workspace/contracts'
import * as v from 'valibot'
import { getDefaultPlatformDatabase, type PlatformDatabase } from '../db/client'
import { migratePlatformDatabase } from '../db/migrations'
import { appSettings } from '../db/schema'
import { limitText, recordRequestContext } from '../observability'
import { settingsErrors } from './structured-errors'

const MAX_REASON_CHARS = 400

type Issues = [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]]

/**
 * Server-authoritative settings, stored one row per section.
 *
 * Reads rebuild the document from whatever rows exist and let the contract fill
 * the rest, so a section nobody has written has no row at all and its default
 * always comes from the current build rather than a copy frozen at install
 * time. Writes replace whole sections inside one transaction, so a save that
 * touches two sections is never half-applied.
 */
export class SettingsService {
  private readonly database: PlatformDatabase

  constructor(database: PlatformDatabase = getDefaultPlatformDatabase()) {
    this.database = database
    migratePlatformDatabase(database)
  }

  read(): Settings {
    const settings = this.load()
    recordRequestContext(settingsContext('read', settings))

    return settings
  }

  update(patch: unknown): Settings {
    const parsed = v.safeParse(settingsPatchSchema, patch)
    if (!parsed.success) throw settingsErrors.PATCH_INVALID({ reason: issueReason(parsed.issues) })

    const sections = Object.entries(parsed.output)
    this.writeSections(sections)
    const settings = this.load()
    recordRequestContext({
      ...settingsContext('update', settings),
      settingsSections: sections.map(([section]) => section),
    })

    return settings
  }

  private writeSections(sections: readonly (readonly [string, unknown])[]) {
    if (sections.length === 0) return

    const updatedAt = new Date().toISOString()
    this.database.transaction((transaction) => {
      for (const [section, value] of sections) {
        const valueJson = JSON.stringify(value)
        transaction
          .insert(appSettings)
          .values({ section, updatedAt, valueJson })
          .onConflictDoUpdate({ target: appSettings.section, set: { updatedAt, valueJson } })
          .run()
      }
    })
  }

  private load(): Settings {
    const parsed = v.safeParse(settingsSchema, this.storedSections())
    if (parsed.success) return parsed.output

    throw settingsErrors.STORED_SECTION_INVALID({
      reason: issueReason(parsed.issues),
      section: issueSection(parsed.issues),
    })
  }

  private storedSections(): Record<string, unknown> {
    const rows = this.database.select().from(appSettings).all()
    const sections: Record<string, unknown> = {}

    for (const row of rows) {
      sections[row.section] = parseSectionJson(row.section, row.valueJson)
    }

    return sections
  }
}

function parseSectionJson(section: string, valueJson: string): unknown {
  try {
    return JSON.parse(valueJson)
  } catch {
    throw settingsErrors.STORED_SECTION_INVALID({ reason: 'row does not hold JSON', section })
  }
}

/**
 * Fields folded into the request's own event rather than emitted as extra log
 * lines: the counts are what makes a settings request answerable later ("did
 * the client save an empty provider list?") without replaying the body.
 */
function settingsContext(operation: 'read' | 'update', settings: Settings) {
  return {
    area: 'settings',
    operation,
    settings: {
      hiddenModelCount: settings.models.hidden.length,
      keybindingOverrideCount: Object.keys(settings.keybindings).length,
      orderedModelCount: settings.models.order.length,
      providerInstanceCount: settings.providerInstances.length,
    },
  }
}

function issueReason(issues: Issues): string {
  return limitText(v.summarize(issues).replaceAll('\n', ' '), MAX_REASON_CHARS)
}

function issueSection(issues: Issues): string {
  const first = issues[0].path?.[0]

  return typeof first?.key === 'string' ? first.key : 'unknown'
}
