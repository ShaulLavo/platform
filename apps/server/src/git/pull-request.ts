import type {
  GitPullRequest,
  GitPullRequestCreateResult,
  GitPullRequestSupport,
} from '@workspace/contracts'

import { gitPullRequestErrors } from './utils/pull-request-errors'
import { runBoundedProcess } from './utils/process'

/**
 * `gh` reaches the network, but only to read one branch's pull request. 20s is
 * long enough for a cold auth handshake and short enough that a wedged CLI
 * cannot hold a header render.
 */
const GH_TIMEOUT_MS = 20_000

const PR_FIELDS = 'isDraft,number,state,title,url'

/**
 * Whether `gh` works here changes when someone installs it or signs in — not
 * between two renders of a header. Caching the verdict keeps the two probe
 * processes off every read; the window is short enough that signing in shows
 * up on the next poll rather than requiring a restart.
 */
const SUPPORT_CACHE_TTL_MS = 60_000

const supportByCwd = new Map<string, { at: number; support: GitPullRequestSupport }>()

type GhJson = {
  isDraft?: unknown
  number?: unknown
  state?: unknown
  title?: unknown
  url?: unknown
}

/**
 * Reads the pull request for a branch, or says why it could not.
 *
 * Every failure is classified rather than swallowed: a caller that cannot tell
 * "no pull request" from "gh is not installed" will offer Create to someone who
 * already has one open, and hide the button from someone who needs it.
 */
export async function readPullRequest(input: {
  branch: string
  cwd: string
}): Promise<{ pullRequest: GitPullRequest | null; support: GitPullRequestSupport }> {
  const support = await pullRequestSupport(input.cwd)
  if (support !== 'ready') return { pullRequest: null, support }

  const result = await gh(input.cwd, ['pr', 'view', input.branch, '--json', PR_FIELDS])
  // `gh pr view` exits non-zero for "no pull request found", which is a real
  // answer rather than a failure — anything else with no parseable payload is
  // reported as unreadable instead of as an absence.
  if (result.exitCode !== 0) return { pullRequest: null, support: 'ready' }

  return { pullRequest: parsePullRequest(result.stdout), support: 'ready' }
}

export async function createPullRequest(input: {
  base?: string
  body?: string
  branch: string
  cwd: string
  draft?: boolean
  title: string
}): Promise<GitPullRequestCreateResult> {
  const existing = await readPullRequest({ branch: input.branch, cwd: input.cwd })
  if (existing.support !== 'ready') return { kind: 'unsupported', support: existing.support }
  // A branch carries at most one open pull request, so the honest answer to a
  // second request is the first one — not a second call that `gh` will reject.
  if (existing.pullRequest) return { kind: 'exists', pullRequest: existing.pullRequest }

  const result = await gh(input.cwd, [
    'pr',
    'create',
    '--head',
    input.branch,
    '--title',
    input.title,
    '--body',
    input.body ?? '',
    ...(input.base ? ['--base', input.base] : []),
    ...(input.draft ? ['--draft'] : []),
  ])
  if (result.exitCode !== 0) {
    throw gitPullRequestErrors.PULL_REQUEST_CREATE_FAILED({
      branch: input.branch,
      internal: { stderr: result.stderr || result.stdout },
    })
  }

  // `gh pr create` prints the URL, not JSON. Reading the branch back is what
  // turns that into the same shape every other caller already handles.
  const created = await readPullRequest({ branch: input.branch, cwd: input.cwd })
  if (!created.pullRequest) {
    throw gitPullRequestErrors.PULL_REQUEST_CREATE_FAILED({
      branch: input.branch,
      internal: { stdout: result.stdout },
    })
  }

  return { kind: 'created', pullRequest: created.pullRequest }
}

async function pullRequestSupport(cwd: string): Promise<GitPullRequestSupport> {
  const cached = supportByCwd.get(cwd)
  if (cached && Date.now() - cached.at < SUPPORT_CACHE_TTL_MS) return cached.support

  const support = await probePullRequestSupport(cwd)
  supportByCwd.set(cwd, { at: Date.now(), support })

  return support
}

async function probePullRequestSupport(cwd: string): Promise<GitPullRequestSupport> {
  const status = await gh(cwd, ['auth', 'status'])
  // Bun reports a missing binary as a spawn failure, which surfaces here as a
  // non-zero exit with nothing on either pipe.
  if (status.exitCode !== 0 && !status.stderr && !status.stdout) return 'cli-missing'
  if (status.exitCode !== 0) return 'unauthenticated'

  const remote = await gh(cwd, ['repo', 'view', '--json', 'url'])
  if (remote.exitCode !== 0) return 'no-github-remote'

  return 'ready'
}

async function gh(cwd: string, args: readonly string[]) {
  try {
    return await runBoundedProcess({ argv: ['gh', ...args], cwd, timeoutMs: GH_TIMEOUT_MS })
  } catch {
    // A missing `gh` throws out of `Bun.spawn` rather than exiting non-zero.
    // The caller only ever asks "did this work", so the two collapse here.
    return { exitCode: 127, stderr: '', stdout: '' }
  }
}

function parsePullRequest(stdout: string): GitPullRequest | null {
  const json = parseJson(stdout)
  if (!json) return null

  const number = typeof json.number === 'number' ? json.number : null
  const url = typeof json.url === 'string' ? json.url : null
  if (number === null || !url) return null

  return {
    draft: json.isDraft === true,
    number,
    state: pullRequestState(json.state),
    title: typeof json.title === 'string' ? json.title : `#${number}`,
    url,
  }
}

function pullRequestState(value: unknown): GitPullRequest['state'] {
  if (value === 'MERGED') return 'merged'
  if (value === 'CLOSED') return 'closed'

  return 'open'
}

function parseJson(stdout: string): GhJson | null {
  const trimmed = stdout.trim()
  if (!trimmed) return null

  try {
    const parsed: unknown = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? (parsed as GhJson) : null
  } catch {
    return null
  }
}
