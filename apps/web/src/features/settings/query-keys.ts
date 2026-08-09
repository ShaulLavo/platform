export const settingsKeys = {
  all: ['settings'] as const,
  document: () => [...settingsKeys.all, 'document'] as const,
}
