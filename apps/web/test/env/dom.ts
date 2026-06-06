import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import './jest-dom'

// Unmount anything React Testing Library rendered between tests so the happy-dom
// document never leaks state across cases.
afterEach(() => {
  cleanup()
})
