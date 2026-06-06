import { setupServer } from 'msw/node'
import { handlers } from './handlers'

// Node-side request interceptor shared by the `node` and `dom` projects.
export const server = setupServer(...handlers)
