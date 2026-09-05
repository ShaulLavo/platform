const KEY = 'platform.environments.connected.v1'

export function readConnectedMachines(): readonly string[] {
  try {
    const names: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(names)
      ? names.filter((name): name is string => typeof name === 'string')
      : []
  } catch {
    return []
  }
}

export function writeConnectedMachines(names: ReadonlySet<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...names]))
  } catch {
    return
  }
}
