import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ClarifyAnswer, ClarifyRound, CopilotResult, Strategy } from '../lib/data'
import { persistentJSON } from '../lib/storage'

/** Saved progress of 02 Upřesnění, so returning to a project restores it exactly. */
export interface ClarifyProgress {
  done: { round: ClarifyRound; answers: ClarifyAnswer[] }[]
  current: ClarifyRound | null
  /** Folded "Analyzováno za … · n kroků" summary of the last finished analysis. */
  trace: { stages: string[]; ms: number } | null
}

export interface CopilotChatTurn {
  role: 'user' | 'assistant'
  text: string
}

interface ProjectUiState {
  /** Selected strategy per project. */
  strategy: Record<string, Strategy>
  /** Application created for a project. */
  applicationOf: Record<string, string>
  /** Clarification progress per project. */
  clarify: Record<string, ClarifyProgress>
  /** Last copilot feed per application. */
  copilot: Record<string, CopilotResult>
  /** Copilot chat per application: the user's messages and the copilot's replies, oldest first. */
  copilotChat: Record<string, CopilotChatTurn[]>

  setStrategy: (projectId: string, strategy: Strategy) => void
  setApplication: (projectId: string, applicationId: string) => void
  setClarify: (projectId: string, progress: ClarifyProgress) => void
  setCopilot: (applicationId: string, feed: CopilotResult) => void
  setCopilotChat: (applicationId: string, turns: CopilotChatTurn[]) => void
  forget: (projectId: string) => void
}

export const useProjectStore = create<ProjectUiState>()(
  persist(
    (set) => ({
      strategy: {},
      applicationOf: {},
      clarify: {},
      copilot: {},
      copilotChat: {},

      setStrategy: (projectId, strategy) => set((s) => ({ strategy: { ...s.strategy, [projectId]: strategy } })),
      setApplication: (projectId, applicationId) =>
        set((s) => ({ applicationOf: { ...s.applicationOf, [projectId]: applicationId } })),
      setClarify: (projectId, progress) => set((s) => ({ clarify: { ...s.clarify, [projectId]: progress } })),
      setCopilot: (applicationId, feed) => set((s) => ({ copilot: { ...s.copilot, [applicationId]: feed } })),
      setCopilotChat: (applicationId, turns) => set((s) => ({ copilotChat: { ...s.copilotChat, [applicationId]: turns } })),
      forget: (projectId) =>
        set((s) => {
          const omit = <T,>(r: Record<string, T>) => {
            const rest = { ...r }
            delete rest[projectId]
            return rest
          }
          return { strategy: omit(s.strategy), applicationOf: omit(s.applicationOf), clarify: omit(s.clarify) }
        }),
    }),
    { name: 'chris:ui', storage: persistentJSON(), version: 2 },
  ),
)
