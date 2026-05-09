import { toast } from "sonner"

import { errorMessage } from "@/lib/file-server"

export function notifyMutationError(error: unknown) {
  toast.error("Git command failed", {
    description: errorMessage(error),
  })
}
