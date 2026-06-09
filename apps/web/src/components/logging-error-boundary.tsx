import { ArrowsClockwiseIcon, WarningCircleIcon } from '@phosphor-icons/react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@workspace/ui/components/accordion'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Component, type ErrorInfo, type ReactNode } from 'react'

import {
  reactErrorDisplayMessage,
  reactErrorDisplayName,
  reactErrorStackTrace,
  reportReactError,
} from '@/lib/react-error-reporting'

type LoggingErrorBoundaryProps = {
  children: ReactNode
}

type LoggingErrorBoundaryState = {
  error: unknown | null
  errorInfo: Pick<ErrorInfo, 'componentStack'> | null
}

export class LoggingErrorBoundary extends Component<
  LoggingErrorBoundaryProps,
  LoggingErrorBoundaryState
> {
  state: LoggingErrorBoundaryState = {
    error: null,
    errorInfo: null,
  }

  static getDerivedStateFromError(error: unknown): LoggingErrorBoundaryState {
    return { error, errorInfo: null }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    reportReactError({ error, errorInfo, kind: 'boundary' })
  }

  render() {
    if (this.state.error) return this.renderErrorDialog()

    return this.props.children
  }

  private renderErrorDialog() {
    const errorName = reactErrorDisplayName(this.state.error)
    const errorMessage = reactErrorDisplayMessage(this.state.error)
    const stackTrace = reactErrorStackTrace(this.state.error, this.state.errorInfo)

    return (
      <Dialog open>
        <DialogContent
          className='max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-md'
          showCloseButton={false}
        >
          <div className='border-border bg-muted/30 border-b px-4 py-3'>
            <DialogHeader className='gap-2'>
              <div className='flex items-start gap-3'>
                <div className='border-destructive/30 bg-destructive/10 text-destructive mt-0.5 flex size-8 shrink-0 items-center justify-center border'>
                  <WarningCircleIcon className='size-4' weight='fill' />
                </div>
                <div className='min-w-0 space-y-1'>
                  <DialogTitle>Application error</DialogTitle>
                  <DialogDescription>
                    The interface hit a render failure. Details were written to the local evlog
                    JSONL logs.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
          <div className='grid gap-3 px-4 py-4'>
            <div className='border-border bg-card text-card-foreground grid gap-1 border p-3'>
              <div className='text-muted-foreground text-xs font-medium'>{errorName}</div>
              <div className='text-foreground font-mono text-xs/relaxed break-words'>
                {errorMessage}
              </div>
            </div>
            <p className='text-muted-foreground text-xs/relaxed'>
              Reload the app after the underlying issue is fixed.
            </p>
            <Accordion className='border-border border' keepMounted>
              <AccordionItem value='stack-trace'>
                <AccordionTrigger className='px-3'>Stack trace</AccordionTrigger>
                <AccordionContent className='px-3'>
                  <pre className='bg-muted/30 text-muted-foreground border-border max-h-64 overflow-auto border p-2 font-mono text-[11px]/relaxed whitespace-pre-wrap'>
                    {stackTrace || 'No stack trace available.'}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          <DialogFooter className='border-border bg-muted/20 border-t px-4 py-3'>
            <Button onClick={reloadPage}>
              <ArrowsClockwiseIcon data-icon='inline-start' />
              Reload app
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
}

function reloadPage() {
  window.location.reload()
}
