import { launchTui } from '../../../../scripts/tui'

process.exit(
  await launchTui({
    args: [],
    entrypoint: new URL('./job-control-session.ts', import.meta.url).pathname,
  }),
)
