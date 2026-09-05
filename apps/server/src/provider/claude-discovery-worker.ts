import { listSessions } from '@anthropic-ai/claude-agent-sdk'
import * as v from 'valibot'
import { discoveryInputSchema, discoveredSessionsSchema } from './utils/discovery-metadata'

const input = v.parse(discoveryInputSchema, JSON.parse(await Bun.stdin.text()))
const sessions = await listSessions({
  dir: input.cwd,
  limit: input.limit,
  offset: input.offset,
  includeWorktrees: true,
  includeProgrammatic: false,
})
const metadata = sessions.map((session) => ({
  sessionId: session.sessionId,
  cwd: session.cwd ?? null,
  title: session.customTitle?.trim() || session.summary.trim() || 'Claude session',
  sourceUpdatedAt: new Date(session.lastModified).toISOString(),
  gitBranch: session.gitBranch ?? null,
}))
await Bun.write(Bun.stdout, JSON.stringify(v.parse(discoveredSessionsSchema, metadata)))
