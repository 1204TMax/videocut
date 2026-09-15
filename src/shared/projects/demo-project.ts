import { createProject, getProject } from '@/infrastructure/storage'
import { DEFAULT_PROJECT_FPS, DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from './defaults'
import { CURRENT_SCHEMA_VERSION } from './migrations'
import type { Project } from '@/types/project'

export const DEMO_PROJECT_ID = 'sucai-edit'
export const DEMO_PROJECT_NAME = 'VideoCut'

function createDemoProject(): Project {
  const now = Date.now()

  return {
    id: DEMO_PROJECT_ID,
    name: DEMO_PROJECT_NAME,
    description: '',
    createdAt: now,
    updatedAt: now,
    duration: 0,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: {
      width: DEFAULT_PROJECT_WIDTH,
      height: DEFAULT_PROJECT_HEIGHT,
      fps: DEFAULT_PROJECT_FPS,
    },
  }
}

export async function ensureDemoProject(): Promise<Project> {
  const existing = await getProject(DEMO_PROJECT_ID)
  if (existing) return existing

  return createProject(createDemoProject())
}
