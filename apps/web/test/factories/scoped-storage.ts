import { environmentScopedStorage } from '@/lib/environments/state/scoped-storage'
import { TEST_ENVIRONMENT_ID } from './chat'

export const testScopedStorage = environmentScopedStorage(TEST_ENVIRONMENT_ID)
