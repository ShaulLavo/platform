import type { Environment } from 'vitest/runtime'
import { builtinEnvironments } from 'vitest/runtime'

const happyDomSsrEnvironment: Environment = {
  ...builtinEnvironments['happy-dom'],
  name: 'happy-dom-ssr',
  viteEnvironment: 'ssr',
}

export default happyDomSsrEnvironment
