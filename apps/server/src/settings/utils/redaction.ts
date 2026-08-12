import { REDACTED_SETTINGS_VALUE, type Settings } from '@workspace/contracts'

type ProviderInstances = Settings['providerInstances']

/**
 * Masks every provider environment value that has one.
 *
 * An empty value is left empty rather than masked: "not set" and "set to
 * something I am not showing you" are different facts, and an editor that
 * cannot tell them apart makes the user guess whether a variable is configured.
 */
export function redactSettings(settings: Settings): Settings {
  return { ...settings, providerInstances: redactInstances(settings.providerInstances) }
}

/**
 * Puts the stored secrets back where the caller sent the mask.
 *
 * Matched by instance id and variable name, never by position: an editor that
 * reorders or removes rows would otherwise restore a secret onto the wrong
 * variable. An unknown pair carrying the mask resolves to empty — the only
 * honest answer, since there is nothing stored to keep.
 */
export function restoreRedactedSecrets<Patch extends Partial<Settings>>(
  patch: Patch,
  stored: Settings,
): Patch {
  if (!patch.providerInstances) return patch

  const storedByInstance = new Map(
    stored.providerInstances.map((instance) => [
      instance.providerInstanceId,
      new Map(instance.environment.map((variable) => [variable.name, variable.value])),
    ]),
  )

  return {
    ...patch,
    providerInstances: patch.providerInstances.map((instance) => ({
      ...instance,
      environment: instance.environment.map((variable) => {
        if (variable.value !== REDACTED_SETTINGS_VALUE) return variable

        const kept = storedByInstance.get(instance.providerInstanceId)?.get(variable.name) ?? ''

        return { ...variable, value: kept }
      }),
    })),
  }
}

function redactInstances(instances: ProviderInstances): ProviderInstances {
  return instances.map((instance) => ({
    ...instance,
    environment: instance.environment.map((variable) => ({
      ...variable,
      value: variable.value === '' ? '' : REDACTED_SETTINGS_VALUE,
    })),
  }))
}
