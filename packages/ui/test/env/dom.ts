// These tests call React's `act` directly, so declare the same contract that
// React Testing Library establishes for its own render helpers.
const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}

reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true
