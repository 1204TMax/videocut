import { createFileRoute, redirect } from '@tanstack/react-router'
import { DEMO_PROJECT_ID, ensureDemoProject } from '@/shared/projects/demo-project'

export const Route = createFileRoute('/editor/$projectId')({
  // Editor loader data is tiny and migration state must be fresh on reopen.
  // Avoid keeping inactive editor matches around with stale "requires upgrade" flags.
  gcTime: 0,
  preloadGcTime: 0,
  loader: async ({ params }) => {
    if (params.projectId !== DEMO_PROJECT_ID) {
      throw redirect({
        to: '/editor/$projectId',
        params: { projectId: DEMO_PROJECT_ID },
        replace: true,
      })
    }

    const { CURRENT_SCHEMA_VERSION } = await import('@/shared/projects/migrations')
    // VideoCut has one fixed workspace. Direct editor links must create it just
    // like the root entry does, otherwise a first-time visitor sees the legacy
    // "project not found" screen before the workspace has been initialized.
    const project = await ensureDemoProject()

    const storedSchemaVersion = project.schemaVersion ?? 1

    // Only pass metadata needed for Editor initialization (not timeline data)
    return {
      project: {
        id: project.id,
        name: project.name,
        width: project.metadata.width,
        height: project.metadata.height,
        fps: project.metadata.fps,
        backgroundColor: project.metadata.backgroundColor,
      },
      migration: {
        storedSchemaVersion,
        currentSchemaVersion: CURRENT_SCHEMA_VERSION,
        requiresUpgrade: storedSchemaVersion < CURRENT_SCHEMA_VERSION,
      },
    }
  },
})
