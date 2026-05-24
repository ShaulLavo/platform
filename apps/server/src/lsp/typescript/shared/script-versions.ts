import { statSync } from 'node:fs'

export class ScriptVersionRegistry {
  private readonly versions = new Map<string, number>()

  get(fileName: string): string {
    const cached = this.versions.get(fileName)
    if (cached !== undefined) return String(cached)

    const seeded = fileMtimeVersion(fileName)
    this.versions.set(fileName, seeded)
    return String(seeded)
  }

  bump(fileName: string): void {
    const current = this.versions.get(fileName) ?? fileMtimeVersion(fileName)
    this.versions.set(fileName, current + 1)
  }
}

export function createScriptVersionRegistry(): ScriptVersionRegistry {
  return new ScriptVersionRegistry()
}

export function scriptVersion(registry: ScriptVersionRegistry, fileName: string): string {
  return registry.get(fileName)
}

export function bumpScriptVersion(registry: ScriptVersionRegistry, fileName: string): void {
  registry.bump(fileName)
}

function fileMtimeVersion(fileName: string): number {
  try {
    return statSync(fileName).mtimeMs
  } catch {
    return 0
  }
}
