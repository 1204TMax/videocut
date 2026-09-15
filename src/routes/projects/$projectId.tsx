import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectRouteRedirect,
})

function ProjectRouteRedirect() {
  return <Navigate to="/" replace />
}
