import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import * as v from 'valibot'
import {
  ORCHESTRATION_THREAD_SEARCH_SNIPPET_MAX_LENGTH,
  orchestrationSearchThreadsInputSchema,
  orchestrationSearchThreadsResultSchema,
  type OrchestrationSearchThreadsInput,
  type OrchestrationSearchThreadsResult,
} from '@workspace/contracts'
import { getDefaultPlatformDatabase } from '../db/client'
import { projectionThreadMessages, projectionThreads } from '../db/schema'
import type { OrchestrationDatabase } from './event-store'

const ELLIPSIS = '…'

/** Characters kept before the match so the snippet reads as a sentence, not a fragment. */
const SNIPPET_LEAD_CHARS = 40

/**
 * Searches persisted message content, which is the only place an answer to
 * "where did I discuss X" exists — titles and branches were never written by
 * the conversation. Every query runs against the projection, so a match is
 * always something the thread actually said.
 */
export class OrchestrationThreadSearchQuery {
  private readonly injectedDatabase: OrchestrationDatabase | null

  /**
   * The handle is optional and resolved lazily. Route wiring is built before
   * any request arrives, and resolving the process-wide database there would
   * open — and create — the real SQLite file inside tests that inject their own.
   */
  constructor(database?: OrchestrationDatabase) {
    this.injectedDatabase = database ?? null
  }

  search(input: OrchestrationSearchThreadsInput): OrchestrationSearchThreadsResult {
    const query = v.parse(orchestrationSearchThreadsInputSchema, input)
    const rows = this.newestMatchPerThread(query.query, query.limit)

    return v.parse(orchestrationSearchThreadsResultSchema, {
      matches: rows.map((row) => ({
        messageCreatedAt: row.messageCreatedAt,
        projectId: row.projectId,
        snippet: buildSnippet(row.text, query.query),
        source: row.role,
        threadId: row.threadId,
      })),
    })
  }

  private get database(): OrchestrationDatabase {
    return this.injectedDatabase ?? getDefaultPlatformDatabase()
  }

  /**
   * `max()` with bare columns is SQLite's documented "row of the extreme value"
   * rule: with exactly one min/max aggregate, the non-aggregated columns come
   * from the row that produced it. That is what collapses a thread to its most
   * recent hit in a single pass instead of a per-thread follow-up query.
   */
  private newestMatchPerThread(query: string, limit: number) {
    const newestMatchAt = sql<string>`max(${projectionThreadMessages.createdAt})`

    return this.database
      .select({
        messageCreatedAt: newestMatchAt,
        projectId: projectionThreads.projectId,
        role: projectionThreadMessages.role,
        text: projectionThreadMessages.text,
        threadId: projectionThreadMessages.threadId,
      })
      .from(projectionThreadMessages)
      .innerJoin(
        projectionThreads,
        eq(projectionThreads.threadId, projectionThreadMessages.threadId),
      )
      .where(
        and(
          isNull(projectionThreads.deletedAt),
          // `system` messages are plumbing the user never wrote or read, and
          // the match contract only has a source for the two that they did.
          ne(projectionThreadMessages.role, 'system'),
          containsLiteral(projectionThreadMessages.text, query),
        ),
      )
      .groupBy(projectionThreadMessages.threadId)
      .orderBy(desc(newestMatchAt))
      .limit(limit)
      .all()
  }
}

/**
 * `LIKE` reads `%` and `_` as wildcards, so an unescaped query of two percent
 * signs would pass the length bound and still match every message ever stored.
 * Escaping keeps the pattern literal: the contract bounds the input, this
 * bounds what the input can ask the scan to do.
 */
function containsLiteral(column: SQLiteColumn, query: string) {
  return sql`${column} like ${`%${escapeLikePattern(query)}%`} escape '\\'`
}

function escapeLikePattern(query: string) {
  return query.replace(/[\\%_]/g, (character) => `\\${character}`)
}

/**
 * A window around the first occurrence rather than the head of the message: a
 * hit two thousand characters into a long answer has to be visible in the
 * result, or the search cannot be trusted to have found anything.
 */
function buildSnippet(text: string, query: string) {
  const collapsed = text.replace(/\s+/gu, ' ').trim()
  const matchIndex = collapsed.toLowerCase().indexOf(query.toLowerCase())
  const start = Math.max(0, Math.max(matchIndex, 0) - SNIPPET_LEAD_CHARS)
  const lead = start > 0 ? ELLIPSIS : ''
  const budget = ORCHESTRATION_THREAD_SEARCH_SNIPPET_MAX_LENGTH - lead.length
  const tail = collapsed.slice(start)
  if (tail.length <= budget) return lead + tail

  return lead + tail.slice(0, budget - ELLIPSIS.length) + ELLIPSIS
}
