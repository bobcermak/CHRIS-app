import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useProject } from '../../lib/queries'
import { useSessionsStore } from '../../stores/sessionsStore'

const PROJECT_PATH = /^\/projekt\/([^/]+)\/(upresneni|tymy|prihlaska)$/

/**
 * Remembers where the user is inside each project, so the home page can reopen the exact step
 * (with its search params) — also after a refresh. Renders nothing.
 */
export function SessionTracker() {
  const { pathname, searchStr } = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, searchStr: s.location.searchStr }),
  })
  const projectId = PROJECT_PATH.exec(pathname)?.[1] ?? ''
  const project = useProject(projectId)
  const exists = useSessionsStore((s) => Boolean(projectId && s.sessions[projectId]))
  const upsert = useSessionsStore((s) => s.upsert)
  const touch = useSessionsStore((s) => s.touch)

  const path = `${pathname}${searchStr}`

  // Projects opened before sessions existed (or via a shared link) get registered once.
  useEffect(() => {
    if (projectId && !exists && project.data) upsert({ id: projectId, title: project.data.title, lastPath: path })
  }, [projectId, exists, project.data, upsert, path])

  useEffect(() => {
    if (projectId && exists) touch(projectId, path)
  }, [projectId, exists, touch, path])

  return null
}
