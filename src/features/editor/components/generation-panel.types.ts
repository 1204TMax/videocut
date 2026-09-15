export type GenerationType = 'text' | 'image' | 'video'

/**
 * The browser-facing request passed to the optional VideoCut generation bridge.
 * A host application can use the editor context without exposing provider keys
 * to this static frontend.
 */
export interface VideoCutGenerationContext {
  type: GenerationType
  prompt: string
  model: string
  output: string
  sourceType?: string
  sourceUrl?: string
  sourceText?: string
}

export interface VideoCutGenerationCandidate {
  id?: string
  type?: GenerationType | 'copy'
  name?: string
  url?: string
  thumb?: string
  text?: string
  content?: string
}

export type VideoCutGenerationResult =
  | VideoCutGenerationCandidate
  | VideoCutGenerationCandidate[]
  | { candidates?: VideoCutGenerationCandidate[] }
  | string
  | null
  | undefined

export interface VideoCutGenerationBridge {
  generate: (
    context: VideoCutGenerationContext,
  ) => VideoCutGenerationResult | Promise<VideoCutGenerationResult>
}

declare global {
  interface Window {
    VideoCutGeneration?: VideoCutGenerationBridge
  }
}
