import { defineErrorCatalog } from 'evlog'

/**
 * Settings failures the client has to branch on. A rejected write and a corrupt
 * stored section look identical from the outside — both are "settings did not
 * load" — but only one of them is the caller's fault, and only one of them is
 * worth retrying.
 */
export const settingsErrors = defineErrorCatalog('settings', {
  PATCH_INVALID: {
    status: 400,
    message: ({ reason }: { reason: string }) => `Settings patch is invalid: ${reason}`,
    why: 'The write did not match the settings contract, so applying it would have persisted a document the server cannot read back.',
    fix: 'Send whole, valid sections built from the settings contract. Retrying the same payload cannot succeed.',
  },
  STORED_SECTION_INVALID: {
    status: 500,
    message: ({ reason, section }: { reason: string; section: string }) =>
      `Stored settings section ${section} is invalid: ${reason}`,
    why: 'A persisted settings row no longer parses against the contract, so the server refuses to serve a half-understood document.',
    fix: 'Delete the offending row from the app_settings table; the section falls back to its contract default.',
  },
})
