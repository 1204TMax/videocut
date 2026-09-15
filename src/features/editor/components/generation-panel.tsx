import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Play,
  Sparkles,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/shared/ui/cn'
import type {
  GenerationType,
  VideoCutGenerationCandidate,
  VideoCutGenerationContext,
  VideoCutGenerationResult,
} from './generation-panel.types'

interface GenerationPanelProps {
  type: GenerationType
  onUseCandidate?: (
    candidate: VideoCutGenerationCandidate,
    type: GenerationType,
  ) => void | Promise<void>
}

interface GenerationTypeConfig {
  label: string
  description: string
  placeholder: string
  icon: typeof FileText
  models: Array<{ value: string; label: string }>
  outputLabel: string
  outputs: Array<{ value: string; label: string }>
  expectedCandidateType: GenerationType | 'copy'
}

const GENERATION_CONFIGS: Record<GenerationType, GenerationTypeConfig> = {
  video: {
    label: '视频生成',
    description: '描述想生成或修改的视频内容',
    placeholder: '例如：一段城市夜景延时摄影，镜头缓慢向前推进',
    icon: Video,
    models: [
      { value: 'auto', label: '自动匹配' },
      { value: 'seedance-2.5', label: 'Seedance 2.5' },
      { value: 'wan-2.2', label: 'Wan 2.2' },
    ],
    outputLabel: '视频时长',
    outputs: [
      { value: '4s', label: '4 秒' },
      { value: '8s', label: '8 秒' },
      { value: '10s', label: '10 秒' },
      { value: '15s', label: '15 秒' },
    ],
    expectedCandidateType: 'video',
  },
  image: {
    label: '图片生成',
    description: '描述想生成或修改的画面内容',
    placeholder: '例如：蓝色调的产品棚拍，柔和侧光，留出标题空间',
    icon: ImageIcon,
    models: [
      { value: 'auto', label: '自动匹配' },
      { value: 'seedream-5.0', label: 'Seedream 5.0' },
      { value: 'gpt-image-1', label: 'GPT Image' },
    ],
    outputLabel: '画面比例',
    outputs: [
      { value: 'original', label: '原比例' },
      { value: '1:1', label: '1:1' },
      { value: '9:16', label: '9:16' },
      { value: '16:9', label: '16:9' },
    ],
    expectedCandidateType: 'image',
  },
  text: {
    label: '文本生成',
    description: '描述想生成或改写的文本内容',
    placeholder: '例如：为这支产品视频写一段简洁的开场旁白',
    icon: FileText,
    models: [
      { value: 'auto', label: '自动匹配' },
      { value: 'deepseek-v4', label: 'DeepSeek V4' },
      { value: 'gpt-5', label: 'GPT-5' },
    ],
    outputLabel: '生成数量',
    outputs: [
      { value: '1', label: '1 条' },
      { value: '2', label: '2 条' },
      { value: '4', label: '4 条' },
      { value: '8', label: '8 条' },
    ],
    expectedCandidateType: 'copy',
  },
}

function readService(): Window['VideoCutGeneration'] {
  if (typeof window === 'undefined') return undefined
  return window.VideoCutGeneration
}

function normalizeCandidates(
  result: VideoCutGenerationResult,
  type: GenerationType,
): VideoCutGenerationCandidate[] {
  let candidates: VideoCutGenerationCandidate[]
  if (Array.isArray(result)) {
    candidates = result
  } else if (typeof result === 'string') {
    candidates =
      result.trim().length > 0
        ? [type === 'text' ? { type: 'copy', text: result } : { type, url: result }]
        : []
  } else if (result && typeof result === 'object' && 'candidates' in result) {
    candidates = result.candidates ?? []
  } else if (result) {
    candidates = [result as VideoCutGenerationCandidate]
  } else {
    candidates = []
  }
  const expectedType = GENERATION_CONFIGS[type].expectedCandidateType
  const seen = new Set<string>()

  return candidates
    .filter((candidate) => {
      const candidateType = candidate.type ?? expectedType
      const hasValue =
        expectedType === 'copy'
          ? Boolean(candidate.text ?? candidate.content)
          : Boolean(candidate.url ?? candidate.thumb)
      const typeMatches =
        expectedType === 'copy'
          ? candidateType === 'copy' || candidateType === 'text'
          : candidateType === expectedType
      if (!typeMatches || !hasValue) return false
      const key = candidate.id ?? candidate.url ?? candidate.text ?? candidate.content
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

function candidateTitle(candidate: VideoCutGenerationCandidate, index: number): string {
  return candidate.name?.trim() || `候选 ${index + 1}`
}

function candidatePreview(candidate: VideoCutGenerationCandidate, type: GenerationType) {
  if (type === 'text') {
    return (
      <p className="line-clamp-3 text-[11px] leading-relaxed text-foreground/90">
        {candidate.text ?? candidate.content}
      </p>
    )
  }

  if (!candidate.url && !candidate.thumb) {
    return (
      <div className="flex h-16 items-center justify-center bg-secondary/40 text-muted-foreground">
        暂无预览
      </div>
    )
  }

  if (type === 'video') {
    return (
      <div className="relative h-16 overflow-hidden rounded-sm bg-slate-950">
        <video
          className="h-full w-full object-cover"
          src={candidate.thumb ?? candidate.url}
          muted
          preload="metadata"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <Play className="h-4 w-4 fill-white text-white" />
        </span>
      </div>
    )
  }

  return (
    <div className="h-16 overflow-hidden rounded-sm bg-slate-950">
      <img className="h-full w-full object-cover" src={candidate.thumb ?? candidate.url} alt="" />
    </div>
  )
}

export const GenerationPanel = memo(function GenerationPanel({
  type,
  onUseCandidate,
}: GenerationPanelProps) {
  const config = GENERATION_CONFIGS[type]
  const Icon = config.icon
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState(config.models[0]?.value ?? 'auto')
  const [output, setOutput] = useState(config.outputs[0]?.value ?? '')
  const [status, setStatus] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [serviceAvailable, setServiceAvailable] = useState(() => Boolean(readService()?.generate))
  const [candidates, setCandidates] = useState<VideoCutGenerationCandidate[]>([])
  const [usingCandidateId, setUsingCandidateId] = useState<string | null>(null)

  useEffect(() => {
    setPrompt('')
    setModel(config.models[0]?.value ?? 'auto')
    setOutput(config.outputs[0]?.value ?? '')
    setStatus('')
    setCandidates([])
  }, [config])

  useEffect(() => {
    const syncAvailability = () => setServiceAvailable(Boolean(readService()?.generate))
    syncAvailability()
    window.addEventListener('videocut-generation-ready', syncAvailability)
    return () => window.removeEventListener('videocut-generation-ready', syncAvailability)
  }, [])

  const canSubmit = serviceAvailable && !isGenerating && prompt.trim().length > 0

  const context = useMemo<VideoCutGenerationContext>(
    () => ({
      type,
      prompt: prompt.trim(),
      model,
      output,
      sourceType: 'editor',
    }),
    [model, output, prompt, type],
  )

  const submit = useCallback(async () => {
    const service = readService()
    if (!service?.generate) {
      setServiceAvailable(false)
      setStatus('生成服务未接入')
      return
    }
    if (!context.prompt) {
      setStatus('请先填写提示词')
      return
    }

    setIsGenerating(true)
    setStatus('正在调用生成服务…')
    try {
      const result = await service.generate(context)
      const nextCandidates = normalizeCandidates(result, type)
      setCandidates(nextCandidates)
      setStatus(
        nextCandidates.length > 0
          ? `已返回 ${nextCandidates.length} 个候选结果`
          : '生成服务未返回可编辑的候选结果',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '请稍后重试'
      setStatus(`生成失败：${message}`)
    } finally {
      setIsGenerating(false)
    }
  }, [context, type])

  const handleUseCandidate = useCallback(
    async (candidate: VideoCutGenerationCandidate, index: number) => {
      if (!onUseCandidate) return
      const id =
        candidate.id ?? candidate.url ?? candidate.text ?? candidate.content ?? String(index)
      setUsingCandidateId(id)
      try {
        await onUseCandidate(candidate, type)
        setStatus('已加入当前项目')
      } catch (error) {
        setStatus(`加入失败：${error instanceof Error ? error.message : '请稍后重试'}`)
      } finally {
        setUsingCandidateId(null)
      }
    },
    [onUseCandidate, type],
  )

  return (
    <section
      className="rounded-lg border border-primary/30 bg-primary/[0.04] p-2.5"
      aria-label={config.label}
    >
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground">{config.label}</div>
          <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            {config.description}
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <label className="block space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            提示词
          </span>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={config.placeholder}
            className="min-h-[78px] border-border bg-background/70 text-xs leading-relaxed"
            aria-label="提示词"
            disabled={isGenerating}
          />
        </label>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="min-w-0 space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              模型
            </span>
            <Select value={model} onValueChange={setModel} disabled={isGenerating}>
              <SelectTrigger className="h-8 border-border bg-background/70 px-2 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.models.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="min-w-0 space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {config.outputLabel}
            </span>
            <Select value={output} onValueChange={setOutput} disabled={isGenerating}>
              <SelectTrigger className="h-8 border-border bg-background/70 px-2 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.outputs.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <Button
          type="button"
          className="h-8 w-full gap-1.5 text-xs"
          onClick={() => void submit()}
          disabled={!canSubmit}
          title={!serviceAvailable ? '生成服务未接入' : undefined}
        >
          {isGenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isGenerating ? '生成中…' : '生成'}
        </Button>

        <div
          className={cn(
            'flex items-start gap-1.5 text-[10px] leading-relaxed',
            serviceAvailable ? 'text-muted-foreground' : 'text-amber-300',
          )}
          role="status"
          aria-live="polite"
        >
          {serviceAvailable ? (
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          )}
          <span>
            {status || (serviceAvailable ? '生成后，候选结果会回到这里供你选择' : '生成服务未接入')}
          </span>
        </div>
      </div>

      <div className="mt-3 border-t border-border/70 pt-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            候选结果
          </span>
          <span className="text-[10px] text-muted-foreground">{candidates.length} 个</span>
        </div>
        {candidates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-secondary/20 px-2 py-3 text-center text-[10px] leading-relaxed text-muted-foreground">
            还没有候选结果
            <br />
            生成任务完成后会显示在这里
          </div>
        ) : (
          <div className="space-y-1.5">
            {candidates.map((candidate, index) => {
              const id =
                candidate.id ??
                candidate.url ??
                candidate.text ??
                candidate.content ??
                String(index)
              return (
                <div key={id} className="rounded-md border border-border bg-secondary/20 p-1.5">
                  {candidatePreview(candidate, type)}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[10px] text-muted-foreground">
                      {candidateTitle(candidate, index)}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 shrink-0 px-2 text-[10px]"
                      onClick={() => void handleUseCandidate(candidate, index)}
                      disabled={!onUseCandidate || usingCandidateId === id}
                    >
                      {usingCandidateId === id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : type === 'text' ? (
                        '加入文本'
                      ) : (
                        '加入素材'
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
})
