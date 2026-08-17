/**
 * The one spelling of the text-file ceiling. `FileSystemService` resolves the
 * effective value (env override, then this default) and `app.ts` hands that
 * resolved number to `GitService`, so both services agree by construction
 * rather than by two constants happening to match.
 */
export const DEFAULT_MAX_TEXT_FILE_BYTES = 209_715_200

export const MAX_TEXT_FILE_BYTES_UPPER_BOUND = 2_147_483_647
