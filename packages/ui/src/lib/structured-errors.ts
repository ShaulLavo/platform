import { defineErrorCatalog } from 'evlog'

export const uiErrors = defineErrorCatalog('ui', {
  CONTEXT_MISSING: {
    status: 500,
    message: ({ message }: { message: string }) => message,
    why: 'A UI hook was rendered outside its required provider.',
    fix: 'Render the component under the provider named in the error message.',
  },
})
