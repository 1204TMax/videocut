import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/projects/')({
  component: ProjectsRedirect,
})

function ProjectsRedirect() {
  return <Navigate to="/" replace />
}
