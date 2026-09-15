import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useCallback,
  memo,
  lazy,
  Suspense,
} from 'react'
import { useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { createLogger, createOperationId } from '@/shared/logging/logger'
import { i18n } from '@/i18n'
import type { ImperativePanelHandle } from 'react-resizable-panels'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { ErrorBoundary } from '@/app/error-boundary'
import { Toolbar } from './toolbar'
import { MediaSidebar } from './media-sidebar'
import { PropertiesSidebar } from './properties-sidebar'
import { PreviewArea } from './preview-area'
import { InteractionLockRegion } from './interaction-lock-region'
import {
  importTimeline,
  importBentoLayoutDialog,
  importFillerRemovalDialog,
  importReverseConformDialog,
  importSilenceRemovalDialog,
  useBentoLayoutDialogStore,
  useFillerRemovalDialogStore,
  useReverseConformDialogStore,
  useSilenceRemovalDialogStore,
} from '@/features/editor/deps/timeline-ui'
import { toast } from 'sonner'
import { useEditorHotkeys } from '@/features/editor/hooks/use-editor-hotkeys'
import { useAutoSave } from '../hooks/use-auto-save'
import {
  useTimelineShortcuts,
  useTransitionBreakageNotifications,
} from '@/features/editor/deps/timeline-hooks'
import { initTransitionChainSubscription } from '@/features/editor/deps/timeline-subscriptions'
import { useTimelineStore } from '@/features/editor/deps/timeline-store'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
import { useSettingsStore } from '@/features/editor/deps/settings'
import { useMaskEditorStore } from '@/features/editor/deps/preview'
import { usePlaybackStore } from '@/shared/state/playback'
import { useEditorStore } from '@/shared/state/editor'
import { clearPreviewAudioCache } from '@/features/editor/deps/composition-runtime'
import { useProjectStore } from '@/features/editor/deps/projects'
import { importExportDialog } from '@/features/editor/deps/export-contract'
import { getEditorLayout, getEditorLayoutCssVars } from '@/config/editor-layout'
import {
  createProjectUpgradeBackup,
  formatProjectUpgradeBackupName,
} from '@/features/editor/deps/projects'
import { useClearKeyframesDialogStore } from '@/shared/state/clear-keyframes-dialog'
import { useTtsGenerateDialogStore } from '@/shared/state/tts-generate-dialog'
import { useProjectMediaMatchDialogStore } from '@/shared/state/project-media-match-dialog'
import { rememberLastEditorProjectId } from '@/shared/projects/last-editor-project'
import {
  importEmbeddedSubtitleTrackPickerHost,
  importSubtitleScanProgressDialog,
  useEmbeddedSubtitlePickerStore,
  useSubtitleScanProgressStore,
} from '@/features/editor/deps/media-library'
import { IoDragReadout } from '@/shared/timeline/io-range'
const logger = createLogger('Editor')
const LazyTimeline = lazy(() => importTimeline().then(({ Timeline }) => ({ default: Timeline })))
const EDITOR_PROJECT_ROUTE_ID = '/editor/$projectId'
const LazyExportDialog = lazy(() =>
  importExportDialog().then((module) => ({
    default: module.ExportDialog,
  })),
)
const LazyClearKeyframesDialog = lazy(() =>
  import('@/features/editor/components/clear-keyframes-dialog').then((module) => ({
    default: module.ClearKeyframesDialog,
  })),
)
const LazyTtsGenerateDialog = lazy(() =>
  import('@/features/editor/components/tts-generate-dialog').then((module) => ({
    default: module.TtsGenerateDialog,
  })),
)
const LazyProjectMediaMatchDialog = lazy(() =>
  import('@/features/editor/components/project-media-match-dialog').then((module) => ({
    default: module.ProjectMediaMatchDialog,
  })),
)
const LazyEmbeddedSubtitleTrackPickerHost = lazy(() =>
  importEmbeddedSubtitleTrackPickerHost().then((module) => ({
    default: module.EmbeddedSubtitleTrackPickerHost,
  })),
)
const LazySubtitleScanProgressDialog = lazy(() =>
  importSubtitleScanProgressDialog().then((module) => ({
    default: module.SubtitleScanProgressDialog,
  })),
)
const LazyBentoLayoutDialog = lazy(() =>
  importBentoLayoutDialog().then((module) => ({
    default: module.BentoLayoutDialog,
  })),
)
const LazyReverseConformDialog = lazy(() =>
  importReverseConformDialog().then((module) => ({
    default: module.ReverseConformDialog,
  })),
)
const LazySilenceRemovalDialog = lazy(() =>
  importSilenceRemovalDialog().then((module) => ({
    default: module.SilenceRemovalDialog,
  })),
)
const LazyFillerRemovalDialog = lazy(() =>
  importFillerRemovalDialog().then((module) => ({
    default: module.FillerRemovalDialog,
  })),
)
function preloadExportDialog() {
  return importExportDialog()
}

/** Project metadata passed from route loader (timeline loaded separately via loadTimeline) */
interface EditorProps {
  projectId: string
  project: {
    id: string
    name: string
    width: number
    height: number
    fps: number
    backgroundColor?: string
  }
  migration: {
    storedSchemaVersion: number
    currentSchemaVersion: number
    requiresUpgrade: boolean
  }
}

/**
 * Tracks the in-flight (or completed) upgrade-backup job per project. Module-
 * scoped so it survives StrictMode's double effect invocation and any remount —
 * the async create can't be cancelled once started, so without this the
 * auto-backup would run twice and create duplicate backups. Keyed by projectId
 * so a re-running effect for the same still-pending project reuses the existing
 * job and can transition out of the pending state, instead of a one-shot guard
 * that would leave the project stuck on the "upgrading" placeholder forever.
 */
const startedUpgradeBackups = new Map<string, Promise<void>>()

/**
 * Video Editor entrypoint.
 * Legacy projects are upgraded automatically: a backup on the original schema is
 * snapshotted first (best-effort safety net), then the editor loads. No prompt.
 */
export const Editor = memo(function Editor({ projectId, project, migration }: EditorProps) {
  const { t } = useTranslation()
  const [upgradeApproved, setUpgradeApproved] = useState(!migration.requiresUpgrade)
  const backupName = formatProjectUpgradeBackupName(
    project.name,
    migration.storedSchemaVersion,
    migration.currentSchemaVersion,
  )

  // Latest projectId, so a backup that finishes after the user navigated away
  // only approves the project it was actually started for.
  const currentProjectIdRef = useRef(projectId)
  currentProjectIdRef.current = projectId

  useEffect(() => {
    setUpgradeApproved(!migration.requiresUpgrade)
  }, [migration.requiresUpgrade, projectId])

  // Auto-backup then auto-upgrade. The backup keeps the pre-upgrade project on its
  // original schema; loading proceeds regardless so the user is never blocked.
  useEffect(() => {
    if (!migration.requiresUpgrade || upgradeApproved) return

    // Reuse this project's in-flight job (StrictMode re-invokes effects, and the
    // async create can't be cancelled once started) rather than bailing out
    // permanently — re-running the effect for the same still-pending project
    // must still be able to transition out of the placeholder state.
    const jobProjectId = projectId
    let job = startedUpgradeBackups.get(jobProjectId)
    if (!job) {
      job = (async () => {
        const opId = createOperationId()
        const event = logger.startEvent('project.upgradeBackup', opId)
        event.merge({
          projectId: jobProjectId,
          fromVersion: migration.storedSchemaVersion,
          toVersion: migration.currentSchemaVersion,
        })
        try {
          const backup = await createProjectUpgradeBackup(jobProjectId, {
            fromVersion: migration.storedSchemaVersion,
            toVersion: migration.currentSchemaVersion,
            backupName,
          })
          event.success({ status: 'created', backupName: backup.name })
          toast.success(t('editor.editor.backupCreated'), { description: backup.name })
        } catch (error) {
          event.failure(error, { status: 'failed' })
          toast.error(t('editor.editor.backupFailed'), {
            description: error instanceof Error ? error.message : t('editor.editor.tryAgain'),
          })
        }
      })()
      startedUpgradeBackups.set(jobProjectId, job)
    }

    let active = true
    void job.then(() => {
      // Only approve the upgrade for the project this job was started for; a late
      // completion after navigation must not unblock a different project.
      if (active && currentProjectIdRef.current === jobProjectId) {
        setUpgradeApproved(true)
      }
    })
    return () => {
      active = false
    }
  }, [
    migration.requiresUpgrade,
    migration.storedSchemaVersion,
    migration.currentSchemaVersion,
    upgradeApproved,
    projectId,
    backupName,
    t,
  ])

  if (!upgradeApproved) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">
          {t('editor.editor.upgrading', { defaultValue: 'Upgrading project…' })}
        </div>
      </div>
    )
  }

  return <LoadedEditor projectId={projectId} project={project} migration={migration} />
})

const EditorDialogHost = memo(function EditorDialogHost({ projectId }: { projectId: string }) {
  const clearKeyframesDialogOpen = useClearKeyframesDialogStore((s) => s.isOpen)
  const ttsGenerateDialogOpen = useTtsGenerateDialogStore((s) => s.isOpen)
  const projectMediaMatchDialogOpen = useProjectMediaMatchDialogStore(
    (s) => s.isOpen && s.projectId === projectId,
  )
  const embeddedSubtitlePickerOpen = useEmbeddedSubtitlePickerStore((s) => s.media !== null)
  const subtitleScanProgressOpen = useSubtitleScanProgressStore((s) => s.open)

  return (
    <>
      {clearKeyframesDialogOpen && (
        <Suspense fallback={null}>
          <LazyClearKeyframesDialog />
        </Suspense>
      )}
      {projectMediaMatchDialogOpen && (
        <Suspense fallback={null}>
          <LazyProjectMediaMatchDialog projectId={projectId} />
        </Suspense>
      )}
      {ttsGenerateDialogOpen && (
        <Suspense fallback={null}>
          <LazyTtsGenerateDialog />
        </Suspense>
      )}
      {embeddedSubtitlePickerOpen && (
        <Suspense fallback={null}>
          <LazyEmbeddedSubtitleTrackPickerHost />
        </Suspense>
      )}
      {subtitleScanProgressOpen && (
        <Suspense fallback={null}>
          <LazySubtitleScanProgressDialog />
        </Suspense>
      )}
    </>
  )
})

const TimelineDialogHost = memo(function TimelineDialogHost() {
  const bentoLayoutOpen = useBentoLayoutDialogStore((s) => s.isOpen)
  const reverseConformOpen = useReverseConformDialogStore((s) => s.request !== null)
  const silenceRemovalOpen = useSilenceRemovalDialogStore((s) => s.isOpen)
  const fillerRemovalOpen = useFillerRemovalDialogStore((s) => s.isOpen)

  return (
    <>
      {bentoLayoutOpen && (
        <Suspense fallback={null}>
          <LazyBentoLayoutDialog />
        </Suspense>
      )}
      {reverseConformOpen && (
        <Suspense fallback={null}>
          <LazyReverseConformDialog />
        </Suspense>
      )}
      {silenceRemovalOpen && (
        <Suspense fallback={null}>
          <LazySilenceRemovalDialog />
        </Suspense>
      )}
      {fillerRemovalOpen && (
        <Suspense fallback={null}>
          <LazyFillerRemovalDialog />
        </Suspense>
      )}
    </>
  )
})

const AutoSaveController = memo(function AutoSaveController({
  onSave,
}: {
  onSave: () => Promise<void>
}) {
  const isDirty = useTimelineStore((s: { isDirty: boolean }) => s.isDirty)
  useAutoSave({ isDirty, onSave })
  return null
})

const TimelineShortcutsController = memo(function TimelineShortcutsController() {
  useTimelineShortcuts()
  return null
})

export const LoadedEditor = memo(function LoadedEditor({
  projectId,
  project,
  migration,
}: EditorProps) {
  const router = useRouter()
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const editorDensity = useSettingsStore((s) => s.editorDensity)
  const snapEnabledPreference = useSettingsStore((s) => s.snapEnabled)
  const editorLayout = getEditorLayout(editorDensity)
  const editorLayoutCssVars = getEditorLayoutCssVars(editorLayout)
  const syncSidebarLayout = useEditorStore((s) => s.syncSidebarLayout)
  const workspace = useEditorStore((s) => s.workspace)
  const mediaFullColumn = useEditorStore((s) => s.mediaFullColumn)
  const propertiesFullColumn = useEditorStore((s) => s.propertiesFullColumn)
  const leftSidebarOpen = useEditorStore((s) => s.leftSidebarOpen)
  const rightSidebarOpen = useEditorStore((s) => s.rightSidebarOpen)
  const setWorkspace = useEditorStore((s) => s.setWorkspace)
  const toggleMediaFullColumn = useEditorStore((s) => s.toggleMediaFullColumn)
  const togglePropertiesFullColumn = useEditorStore((s) => s.togglePropertiesFullColumn)
  const setLeftSidebarOpen = useEditorStore((s) => s.setLeftSidebarOpen)
  const setRightSidebarOpen = useEditorStore((s) => s.setRightSidebarOpen)
  const isMaskEditingActive = useMaskEditorStore((s) => s.isEditing)
  const hasRefreshedMigrationStateRef = useRef(false)
  const timelinePanelRef = useRef<ImperativePanelHandle>(null)

  // Guard against concurrent saves (e.g., spamming Ctrl+S)
  const isSavingRef = useRef(false)

  useEffect(() => {
    hasRefreshedMigrationStateRef.current = false
  }, [projectId])

  useEffect(() => {
    rememberLastEditorProjectId(projectId)
  }, [projectId])

  // Initialize transition chain subscription (pre-computes chains from timeline data)
  // This subscription recomputes chains when items/transitions change - deferred to idle
  // time so it doesn't compete with the initial editor render.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    const id = requestIdleCallback(() => {
      unsubscribe = initTransitionChainSubscription()
    })
    return () => {
      cancelIdleCallback(id)
      unsubscribe?.()
    }
  }, [])

  // Preload the export dialog during idle time so it opens instantly.
  useEffect(() => {
    const id = requestIdleCallback(() => {
      // Best-effort idle preloads: swallow rejections (offline chunk load, or
      // the dynamic import racing test-environment teardown). The real load
      // happens later via lazy() at render time with its own error boundary.
      void preloadExportDialog().catch(() => {})
    })
    return () => cancelIdleCallback(id)
  }, [])

  // Prewarm effect preview thumbnails during idle time without making the
  // effects feature part of the initial editor route chunk.
  useEffect(() => {
    const id = requestIdleCallback(() => {
      // Best-effort prewarm — ignore failures, including the import() promise
      // rejecting when it resolves after the test environment is torn down.
      void import('@/features/editor/deps/effects-contract')
        .then((module) => module.prewarmEffectPreviews())
        .catch(() => {})
    })
    return () => cancelIdleCallback(id)
  }, [])

  // Initialize timeline from project data (or create default tracks for new projects).
  useEffect(() => {
    const { setCurrentProject: setMediaProject, loadMediaItems } = useMediaLibraryStore.getState()
    const { setCurrentProject } = useProjectStore.getState()
    const playbackStore = usePlaybackStore.getState()

    // Clear stale scrub preview from previous editor sessions.
    // A non-null previewFrame puts preview into "scrubbing" mode, which can
    // defer media URL resolution during project open.
    playbackStore.setPreviewFrame(null)

    // Set current project context for media library (v3: project-scoped media)
    setMediaProject(projectId)
    void loadMediaItems().catch((error) => {
      logger.error('Failed to load media library:', error)
    })

    // Set current project in project store for properties panel
    setCurrentProject({
      id: project.id,
      name: project.name,
      description: '',
      duration: 0,
      schemaVersion: migration.currentSchemaVersion,
      metadata: {
        width: project.width,
        height: project.height,
        fps: project.fps,
        backgroundColor: project.backgroundColor,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    // Load timeline from IndexedDB - single source of truth for all timeline state
    const { loadTimeline } = useTimelineStore.getState()
    let cancelled = false

    void (async () => {
      try {
        await loadTimeline(projectId, { allowProjectUpgrade: migration.requiresUpgrade })

        if (cancelled || !migration.requiresUpgrade || hasRefreshedMigrationStateRef.current) {
          return
        }

        hasRefreshedMigrationStateRef.current = true

        // Refresh the editor route metadata once the approved legacy project has
        // opened successfully so future reopens do not briefly show the upgrade prompt.
        await router.invalidate({
          filter: (match) =>
            match.routeId === EDITOR_PROJECT_ROUTE_ID && match.params.projectId === projectId,
        })
      } catch (error) {
        logger.error('Failed to load timeline:', error)
      }
    })()

    // Cleanup: clear project context, stop playback, and release blob URLs when leaving editor
    return () => {
      cancelled = true
      const cleanupPlaybackStore = usePlaybackStore.getState()
      cleanupPlaybackStore.setPreviewFrame(null)
      useMediaLibraryStore.getState().setCurrentProject(null)
      useProjectStore.getState().setCurrentProject(null)
      cleanupPlaybackStore.pause()
      clearPreviewAudioCache()
    }
  }, [
    migration.currentSchemaVersion,
    migration.requiresUpgrade,
    project.backgroundColor,
    project.fps,
    project.height,
    project.id,
    project.name,
    project.width,
    projectId,
    router,
  ])

  useEffect(() => {
    syncSidebarLayout(editorLayout)
  }, [editorLayout, syncSidebarLayout])

  // The product has one editing surface. Normalize any persisted editor
  // preferences before the first paint so the preview, sidebars, and timeline
  // always open in the same layout.
  useLayoutEffect(() => {
    if (workspace !== 'edit') {
      setWorkspace?.('edit')
    }
    if (mediaFullColumn) {
      toggleMediaFullColumn?.()
    }
    if (propertiesFullColumn) {
      togglePropertiesFullColumn?.()
    }
    if (!leftSidebarOpen) {
      setLeftSidebarOpen?.(true)
    }
    if (!rightSidebarOpen) {
      setRightSidebarOpen?.(true)
    }
  }, [
    leftSidebarOpen,
    mediaFullColumn,
    propertiesFullColumn,
    rightSidebarOpen,
    setLeftSidebarOpen,
    setRightSidebarOpen,
    setWorkspace,
    toggleMediaFullColumn,
    togglePropertiesFullColumn,
    workspace,
  ])

  useEffect(() => {
    const timelineState = useTimelineStore.getState()
    if (timelineState.snapEnabled !== snapEnabledPreference) {
      timelineState.toggleSnap()
    }
  }, [snapEnabledPreference])

  useEffect(() => {
    if (!isMaskEditingActive) return
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement) {
      activeElement.blur()
    }
  }, [isMaskEditingActive])

  // Save timeline to project (with guard against concurrent saves)
  const handleSave = useCallback(async () => {
    // Prevent concurrent saves (e.g., spamming Ctrl+S)
    if (isSavingRef.current) {
      return
    }

    isSavingRef.current = true
    const { saveTimeline } = useTimelineStore.getState()

    try {
      await saveTimeline(projectId)
      logger.debug('Project saved successfully')
      toast.success(i18n.t('editor.editor.projectSaved'))
    } catch (error) {
      logger.error('Failed to save project:', error)
      toast.error(i18n.t('editor.editor.projectSaveFailed'))
      throw error // Re-throw so callers know save failed
    } finally {
      isSavingRef.current = false
    }
  }, [projectId])

  const handleExport = useCallback(() => {
    // Pause playback when opening export dialog
    usePlaybackStore.getState().pause()
    void preloadExportDialog()
    setExportDialogOpen(true)
  }, [])

  // Enable keyboard shortcuts
  useEditorHotkeys({
    onSave: handleSave,
    onExport: handleExport,
  })

  // Enable transition breakage notifications
  useTransitionBreakageNotifications()

  const timelineDuration = 30

  return (
    <div
      className="h-screen bg-background flex flex-col overflow-hidden"
      style={editorLayoutCssVars as import('react').CSSProperties}
      role="application"
      aria-label="VideoCut 视频编辑器"
    >
      <AutoSaveController onSave={handleSave} />
      <TimelineShortcutsController />

      {/* Top Toolbar */}
      <InteractionLockRegion locked={isMaskEditingActive}>
        <Toolbar onOverwrite={handleSave} onExport={handleExport} />
      </InteractionLockRegion>

      {/* Main Layout: Full-height sidebar + vertical split */}
      <div className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup
          direction="vertical"
          className="flex-1 min-w-0"
          autoSaveId="editor:timeline-layout"
        >
          {/* Top - Materials + Preview + Properties */}
          <ResizablePanel
            defaultSize={100 - editorLayout.timelineDefaultSize}
            minSize={100 - editorLayout.timelineMaxSize}
            maxSize={100 - editorLayout.timelineMinSize}
          >
            <div className="h-full flex overflow-hidden relative">
              <InteractionLockRegion locked={isMaskEditingActive}>
                <ErrorBoundary level="feature">
                  <MediaSidebar />
                </ErrorBoundary>
              </InteractionLockRegion>

              <ErrorBoundary level="feature">
                <PreviewArea project={project} />
              </ErrorBoundary>

              <InteractionLockRegion locked={isMaskEditingActive}>
                <ErrorBoundary level="feature">
                  <PropertiesSidebar />
                </ErrorBoundary>
              </InteractionLockRegion>
            </div>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className={isMaskEditingActive ? 'pointer-events-none opacity-60' : undefined}
          />

          {/* Bottom - Timeline */}
          <ResizablePanel
            ref={timelinePanelRef}
            defaultSize={editorLayout.timelineDefaultSize}
            minSize={editorLayout.timelineMinSize}
            maxSize={editorLayout.timelineMaxSize}
          >
            <InteractionLockRegion locked={isMaskEditingActive} className="h-full">
              <ErrorBoundary level="feature">
                <Suspense fallback={null}>
                  <LazyTimeline duration={timelineDuration} />
                </Suspense>
              </ErrorBoundary>
            </InteractionLockRegion>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <Suspense fallback={null}>
        {/* Export Dialog */}
        {exportDialogOpen && (
          <LazyExportDialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} />
        )}
      </Suspense>

      <EditorDialogHost projectId={projectId} />
      <TimelineDialogHost />

      {/* Single global cursor-readout for IO (in/out) drags across all surfaces. */}
      <IoDragReadout />
    </div>
  )
})
