import { layoutRectStyle } from '@/features/workbench/utils/layout-style'
import type { LayoutRect } from '@workspace/tiling/utils/layout-geometry'

export function ProofPreviewWindow({ rect }: { readonly rect: LayoutRect }) {
  return (
    <section
      aria-hidden='true'
      className='border-info/60 bg-info/10 pointer-events-none absolute rounded-md border border-dashed shadow-sm transition-[left,top,width,height,opacity] duration-150 ease-out'
      data-proof-preview-window=''
      style={layoutRectStyle(rect)}
    />
  )
}
