import { Toaster as Sonner, type ToasterProps } from "sonner"

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      closeButton
      richColors
      toastOptions={{
        classNames: {
          error: "border-destructive/40",
        },
      }}
      {...props}
    />
  )
}
