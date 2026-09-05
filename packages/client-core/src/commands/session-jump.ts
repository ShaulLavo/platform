/**
 * Jump-to-Nth-session slots, matching the digits they are bound to. Nine of them
 * because that is how many fit on the number row; the tenth session is what
 * next/previous are for.
 */
export const SESSION_JUMP_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export type SessionJumpPosition = (typeof SESSION_JUMP_POSITIONS)[number]

export type SessionJumpCommandId = `workspace.jumpToSession${SessionJumpPosition}`

export function sessionJumpCommandId(position: SessionJumpPosition): SessionJumpCommandId {
  return `workspace.jumpToSession${position}`
}
