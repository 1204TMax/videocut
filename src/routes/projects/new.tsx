import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/projects/new')({
  component: NewProjectRedirect,
})

function NewProjectRedirect() {
  return <Navigate to="/" replace />
}
