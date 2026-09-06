import type { SettingsIssue } from '@/settings/utils/diagnostics'
import type { Theme } from '@/theme/utils/theme'

export function Diagnostics({
  issues,
  focused,
  short,
  repairHint,
  theme,
}: {
  readonly issues: readonly SettingsIssue[]
  readonly focused: boolean
  readonly short: boolean
  readonly repairHint: string
  readonly theme: Theme
}) {
  return (
    <scrollbox id='settings-diagnostics' height={short ? 3 : 6} flexShrink={0} focused={focused}>
      <box flexDirection='column'>
        <text fg={theme.warning}>
          {issues.length} settings {issues.length === 1 ? 'issue' : 'issues'} · Tab to inspect
        </text>
        {issues.map((issue) => (
          <box key={issue.key} flexDirection='column'>
            <text fg={issue.kind === 'syntax' ? theme.destructive : theme.warning}>
              {issue.title}
            </text>
            <text fg={theme.mutedForeground}>{issue.detail}</text>
          </box>
        ))}
        <text fg={theme.info}>{repairHint}</text>
      </box>
    </scrollbox>
  )
}
