/**
 * WorkspaceGate
 *
 * Wraps the router and blocks it until the browser's origin-private file
 * system (OPFS) workspace is ready:
 *
 *   1. Get the origin-private root from navigator.storage.getDirectory()
 *   2. Set it as the active workspace root
 *   3. Bootstrap the workspace and render the router
 *
 * OPFS does not require a user-selected folder or a permission prompt. It is
 * persistent for this browser origin and keeps the demo entry point usable
 * after a reload.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setWorkspaceRoot } from '@/infrastructure/storage/workspace-fs/root'
import { createLogger } from '@/shared/logging/logger'

const logger = createLogger('WorkspaceGate')

type GateStatus =
  | { kind: 'initializing' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'ready' }

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GateStatus>({ kind: 'initializing' })
  const { t } = useTranslation()

  const activate = useCallback(async (handle: FileSystemDirectoryHandle) => {
    setWorkspaceRoot(handle)
    try {
      const { bootstrapWorkspace } = await import('@/infrastructure/storage/workspace-fs/bootstrap')
      await bootstrapWorkspace(handle)
    } catch (error) {
      logger.warn('bootstrapWorkspace failed', error)
    }
    // Fire the auto-purge sweep for long-trashed projects in the
    // background — it touches disk and we don't want it to block the
    // app render. Wrapped in setTimeout so it runs after first paint.
    setTimeout(() => {
      void import('./deps/trash-auto-purge').then(({ autoPurgeExpiredTrash }) =>
        autoPurgeExpiredTrash(),
      )
    }, 0)
    setStatus({ kind: 'ready' })
    window.dispatchEvent(new Event('freecut:ensure-toaster'))
  }, [])

  // Initialize the single hidden workspace before RouterProvider mounts.
  // Route loaders read from workspace-fs synchronously with navigation, so the
  // root must be set before the first route is allowed to run.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (
        typeof navigator === 'undefined' ||
        typeof navigator.storage?.getDirectory !== 'function'
      ) {
        if (!cancelled) {
          setStatus({
            kind: 'unavailable',
            message: t('projects.workspaceGate.unsupportedBrowserDescription'),
          })
        }
        return
      }
      const handle = await navigator.storage.getDirectory()
      if (cancelled) return
      await activate(handle)
    })().catch((error) => {
      logger.error('Gate initialization failed', error)
      if (!cancelled) {
        setStatus({
          kind: 'unavailable',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [activate, t])

  if (status.kind === 'ready') {
    return <>{children}</>
  }

  // During initialization, render a bare background block so the transition
  // from "checking" to "ready" is invisible instead of a splash flash.
  if (status.kind === 'initializing') {
    return <div className="min-h-screen bg-background" aria-hidden="true" />
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold mb-2">
          {t('projects.workspaceGate.unsupportedBrowser')}
        </h1>
        <p className="text-sm text-muted-foreground">{status.message}</p>
      </div>
    </div>
  )
}
