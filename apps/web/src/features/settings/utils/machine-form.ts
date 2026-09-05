import { machineNameSchema, machineSchema, type MachineDefinition } from '@workspace/contracts'
import * as v from 'valibot'

export type MachineDraft = {
  readonly name: string
  readonly kind: MachineDefinition['kind']
  readonly label: string
  readonly target: string
  readonly repoPath: string
  readonly remotePort: string
  readonly url: string
}

export function machineDraft(name = '', machine?: MachineDefinition): MachineDraft {
  return {
    name,
    kind: machine?.kind ?? 'ssh',
    label: machine?.label ?? '',
    target: machine?.kind === 'ssh' ? machine.target : '',
    repoPath: machine?.kind === 'ssh' ? machine.repoPath : '',
    remotePort: machine?.kind === 'ssh' ? String(machine.remotePort ?? '') : '',
    url: machine?.kind === 'origin' ? machine.url : '',
  }
}

export function parseMachineDraft(draft: MachineDraft) {
  const name = v.safeParse(machineNameSchema, draft.name.trim())
  if (!name.success) return { kind: 'invalid', message: name.issues[0].message } as const
  const label = draft.label.trim() || undefined
  const input =
    draft.kind === 'ssh'
      ? {
          kind: draft.kind,
          target: draft.target.trim(),
          repoPath: draft.repoPath.trim(),
          remotePort: draft.remotePort.trim() ? Number(draft.remotePort) : undefined,
          label,
        }
      : { kind: draft.kind, url: draft.url.trim(), label }
  const machine = v.safeParse(machineSchema, input)
  if (!machine.success) return { kind: 'invalid', message: machine.issues[0].message } as const
  return { kind: 'valid', name: name.output, machine: machine.output } as const
}
