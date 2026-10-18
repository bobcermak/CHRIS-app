import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistentJSON } from '../lib/storage'

/** One research project the user worked on — restorable from the home page. */
export interface Session {
  id: string
  /** Short summary of the project (IntentCard.title). */
  title: string
  createdAt: string
  updatedAt: string
  /** Last visited path + search inside the project, e.g. "/projekt/abc/tymy". */
  lastPath: string
  /** Path of the furthest step reached (Upřesnění < Týmy < Přihláška) — where history reopens. */
  furthestPath?: string
}

const STEP_ORDER: Record<string, number> = { upresneni: 1, tymy: 2, prihlaska: 3 }
const stepRank = (path: string | undefined) => STEP_ORDER[path?.split('?')[0].split('/').pop() ?? ''] ?? 0

/** Where to reopen a session: the furthest step reached (older sessions: the last one). */
export const resumePath = (s: Session) => s.furthestPath ?? s.lastPath

/** The further of two paths; a later visit to the same step wins (it carries fresher search params). */
const further = (current: string | undefined, next: string) => (stepRank(next) >= stepRank(current) ? next : current!)

interface SessionsState {
  sessions: Record<string, Session>
  upsert: (s: Pick<Session, 'id' | 'title'> & { lastPath?: string }) => void
  touch: (id: string, lastPath: string) => void
  remove: (id: string) => void
}

export const useSessionsStore = create<SessionsState>()(
  persist(
    (set) => ({
      sessions: {},
      upsert: ({ id, title, lastPath }) =>
        set((s) => {
          const now = new Date().toISOString()
          const prev = s.sessions[id]
          const path = lastPath ?? prev?.lastPath ?? `/projekt/${id}/upresneni`
          return {
            sessions: {
              ...s.sessions,
              [id]: {
                id,
                title,
                createdAt: prev?.createdAt ?? now,
                updatedAt: now,
                lastPath: path,
                furthestPath: further(prev?.furthestPath ?? prev?.lastPath, path),
              },
            },
          }
        }),
      touch: (id, lastPath) =>
        set((s) => {
          const prev = s.sessions[id]
          if (!prev || prev.lastPath === lastPath) return s
          const furthestPath = further(prev.furthestPath ?? prev.lastPath, lastPath)
          return { sessions: { ...s.sessions, [id]: { ...prev, lastPath, furthestPath, updatedAt: new Date().toISOString() } } }
        }),
      remove: (id) =>
        set((s) => {
          const rest = { ...s.sessions }
          delete rest[id]
          return { sessions: rest }
        }),
    }),
    { name: 'chris:sessions', storage: persistentJSON(), version: 1 },
  ),
)

/** Most recently touched first. Sort outside the selector so the store snapshot stays stable. */
export const sortRecent = (sessions: Record<string, Session>) =>
  Object.values(sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
