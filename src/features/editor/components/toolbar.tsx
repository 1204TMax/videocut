import { memo } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'

interface ToolbarProps {
  onExport: () => void
}

export const Toolbar = memo(function Toolbar({ onExport }: ToolbarProps) {
  return (
    <div
      className="panel-header flex flex-shrink-0 items-center justify-between border-b border-border px-3"
      style={{ height: EDITOR_LAYOUT_CSS_VALUES.toolbarHeight }}
      role="toolbar"
      aria-label="内容编辑工作台"
    >
      <h1 className="text-sm font-medium leading-none">内容编辑工作台</h1>

      <Button size="sm" className="gap-1.5 glow-primary-sm" onClick={onExport} aria-label="导出">
        <Download className="h-4 w-4" />
        导出
      </Button>
    </div>
  )
})
