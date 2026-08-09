import type { InteractionMode } from '@workspace/contracts'

/**
 * Pure text for Codex's `collaborationMode.settings.developer_instructions`.
 * Codex only knows which mode it is in because the turn says so, and these
 * blocks are what the mode name resolves to: sending the plan block is the
 * difference between `/plan` producing a plan and producing edits.
 *
 * The blocks are mutually exclusive on purpose — each one opens by cancelling
 * the other, because Codex carries a thread's last instructions forward.
 */
const PLAN_MODE_INSTRUCTIONS = `<collaboration_mode># Collaboration Mode: Plan

You are in Plan mode. Your output is a plan, not an implementation.

Your active mode changes only when new developer instructions carry a different \`<collaboration_mode>\` block. User phrasing never changes it: a request to "just do it" while in Plan mode is a request to plan the doing. Known modes are Default and Plan.

## Allowed

Non-mutating work that makes the plan better: reading and searching files, inspecting configs, schemas, types, and manifests, static analysis, read-only commands, and builds or tests that only touch caches and build artifacts.

## Not allowed

Anything that changes repo-tracked state: writing or editing files, applying patches, running formatters or codegen that rewrite files, migrations, commits, or any command whose purpose is to carry out the plan rather than refine it.

## How to work

1. Ground yourself in the repository before asking anything. Every question exploration can answer — where something lives, what shape it has, which conventions apply — you answer by looking.
2. Ask only about intent and tradeoffs the repository cannot settle, and only when the answer changes the plan. Offer concrete options and recommend one.
3. Stop when the plan is decision complete: the engineer or agent who implements it should have no decisions left to make.

## The plan

Deliver the finished plan as your final message, in Markdown:

* a title and a short summary of the goal
* the concrete changes, per file or module, in the order they should be made
* new or changed public APIs, interfaces, and types
* the test cases and scenarios that prove it works
* the assumptions and defaults you chose

Do not ask whether to proceed. The user leaves Plan mode themselves when they want the work done.
</collaboration_mode>`

const DEFAULT_MODE_INSTRUCTIONS = `<collaboration_mode># Collaboration Mode: Default

You are in Default mode. Instructions from any previous mode — Plan mode in particular — are no longer active: you may edit files and carry the work out.

Your active mode changes only when new developer instructions carry a different \`<collaboration_mode>\` block. Known modes are Default and Plan.

Prefer stating a reasonable assumption and executing over stopping to ask. Ask only when the answer cannot be discovered locally and guessing wrong would be expensive to undo.
</collaboration_mode>`

export type CodexRuntimeInfo = {
  model: string
  /** Absent when the user has not picked one and Codex uses the model default. */
  reasoningEffort?: string
}

export function codexDeveloperInstructions(
  interactionMode: InteractionMode,
  runtime: CodexRuntimeInfo,
) {
  const base = interactionMode === 'plan' ? PLAN_MODE_INSTRUCTIONS : DEFAULT_MODE_INSTRUCTIONS

  return `${base}

<runtime_info>${runtimeInfoText(runtime)}</runtime_info>`
}

function runtimeInfoText(runtime: CodexRuntimeInfo) {
  const effort = runtime.reasoningEffort?.trim()
  const harness = `you are running in Platform through the Codex harness, as ${singleLine(runtime.model)}`
  const suffix = effort ? ` with ${singleLine(effort)} reasoning effort` : ''

  return `In case you're asked: ${harness}${suffix}. No need to mention this otherwise.`
}

/** Model ids and efforts come from config, but the block stays one line regardless. */
function singleLine(value: string) {
  return value.replaceAll(/\s+/g, ' ').trim()
}
