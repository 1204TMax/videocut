import { Navigate, createFileRoute } from '@tanstack/react-router'
import { DEMO_PROJECT_ID, ensureDemoProject } from '@/shared/projects/demo-project'

export const Route = createFileRoute('/')({
  component: DemoEntryRoute,
  beforeLoad: ensureDemoProject,
})

function DemoEntryRoute() {
  return <Navigate to="/editor/$projectId" params={{ projectId: DEMO_PROJECT_ID }} replace />
}
