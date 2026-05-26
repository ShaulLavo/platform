type EditorStatusFilePathProps = {
  filePath: string
}

export function EditorStatusFilePath({ filePath }: EditorStatusFilePathProps) {
  return <span className='text-foreground max-w-[40%] min-w-0 truncate'>{filePath}</span>
}
