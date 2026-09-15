import { memo } from 'react'
import { Download, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'

interface ToolbarProps {
  onOverwrite: () => Promise<void>
  onExport: () => void
}

export const Toolbar = memo(function Toolbar({ onOverwrite, onExport }: ToolbarProps) {
  return (
    <div
      className="panel-header flex flex-shrink-0 items-center justify-between border-b border-border px-3"
      style={{ height: EDITOR_LAYOUT_CSS_VALUES.toolbarHeight }}
      role="toolbar"
      aria-label="VideoCut 视频编辑器"
    >
      <h1 className="text-sm font-medium leading-none">VideoCut</h1>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => void onOverwrite().catch(() => {})}
          aria-label="覆盖"
        >
          <Save className="h-4 w-4" />
          覆盖
        </Button>
        <Button size="sm" className="gap-1.5 glow-primary-sm" onClick={onExport} aria-label="导出">
          <Download className="h-4 w-4" />
          导出
        </Button>
      </div>
    </div>
  )
})
