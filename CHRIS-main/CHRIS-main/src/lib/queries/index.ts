import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { data } from '../data'
import type {
  AddMemberInput,
  ApplicationDraft,
  CreateApplicationInput,
  CreateProjectInput,
  EmailTone,
  Group,
  GroupFilter,
  MatchResult,
  ResearchReport,
  ResearchTarget,
  TemplateSection,
} from '../data'

// Query keys live in one place so invalidation stays consistent.
export const keys = {
  project: (id: string) => ['project', id] as const,
  match: (projectId: string) => ['project', projectId, 'match'] as const,
  email: (projectId: string, groupId: string, tone: EmailTone) => ['project', projectId, 'email', groupId, tone] as const,
  templates: ['templates'] as const,
  template: (id: string) => ['templates', id] as const,
  application: (id: string) => ['application', id] as const,
  groups: (filter: GroupFilter) => ['groups', filter] as const,
  groupSearch: (q: string) => ['groups', 'search', q] as const,
  group: (slug: string) => ['groups', slug] as const,
  grants: (agency: string | undefined) => ['grants', agency ?? null] as const,
  grantSearch: (q: string) => ['grants', 'search', q] as const,
  grant: (slug: string) => ['grants', slug] as const,
  research: (projectId: string, target: ResearchTarget) => ['project', projectId, 'research', target.kind, target.id] as const,
}

// The catalogue changes only when the backend reloads its data — a few minutes of cache is plenty.
const CATALOGUE_STALE = 5 * 60_000

export const projectQuery = (id: string) =>
  queryOptions({ queryKey: keys.project(id), queryFn: () => data.getProject(id), staleTime: Infinity })

export const matchQuery = (projectId: string) =>
  queryOptions({ queryKey: keys.match(projectId), queryFn: () => data.getMatch(projectId), staleTime: Infinity })

export const applicationQuery = (id: string) =>
  queryOptions({ queryKey: keys.application(id), queryFn: () => data.getApplication(id), staleTime: Infinity })

export const templatesQuery = queryOptions({ queryKey: keys.templates, queryFn: () => data.templates(), staleTime: Infinity })

export function useProject(id: string) {
  return useQuery({ ...projectQuery(id), enabled: Boolean(id) })
}

export function useMatch(projectId: string) {
  return useQuery({ ...matchQuery(projectId), enabled: Boolean(projectId) })
}

export function useTemplates() {
  return useQuery(templatesQuery)
}

export function useTemplate(id: string | undefined) {
  return useQuery({ queryKey: keys.template(id ?? ''), queryFn: () => data.getTemplate(id!), enabled: Boolean(id), staleTime: Infinity })
}

export function useApplication(id: string | undefined) {
  return useQuery({ ...applicationQuery(id ?? ''), enabled: Boolean(id) })
}

export function useEmailDraft(projectId: string, groupId: string, tone: EmailTone) {
  return useQuery({
    queryKey: keys.email(projectId, groupId, tone),
    queryFn: () => data.emailDraft(projectId, groupId, tone),
    staleTime: Infinity,
  })
}

export function useGroups(filter: GroupFilter) {
  return useQuery({ queryKey: keys.groups(filter), queryFn: () => data.groups(filter), staleTime: CATALOGUE_STALE })
}

/** Semantic search; off for an empty query (the list query shows everything then). */
export function useGroupSearch(q: string) {
  return useQuery({
    queryKey: keys.groupSearch(q),
    queryFn: () => data.searchGroups(q),
    enabled: q.trim().length > 1,
    staleTime: CATALOGUE_STALE,
    placeholderData: keepPreviousData,
  })
}

/** Fresh group profile; `initial` (e.g. from the match) shows instantly while it loads. */
export function useGroup(slug: string | undefined, initial?: Group) {
  return useQuery({
    queryKey: keys.group(slug ?? ''),
    queryFn: () => data.getGroup(slug!),
    enabled: Boolean(slug),
    staleTime: CATALOGUE_STALE,
    placeholderData: initial,
  })
}

export function useGrants(agency: string | undefined) {
  return useQuery({ queryKey: keys.grants(agency), queryFn: () => data.grants(agency), staleTime: CATALOGUE_STALE })
}

export function useGrantSearch(q: string) {
  return useQuery({
    queryKey: keys.grantSearch(q),
    queryFn: () => data.searchGrants(q),
    enabled: q.trim().length > 1,
    staleTime: CATALOGUE_STALE,
    placeholderData: keepPreviousData,
  })
}

export function useGrant(slug: string | undefined) {
  return useQuery({ queryKey: keys.grant(slug ?? ''), queryFn: () => data.getGrant(slug!), enabled: Boolean(slug), staleTime: CATALOGUE_STALE })
}


/**
 * Match of every catalogue group with the project prompt (one `/groups/search` over all groups),
 * as slug → 0..1. Lets a hand-picked group show its match and where it would rank in the team.
 */
export function useProjectScores(prompt: string | undefined) {
  return useQuery({
    queryKey: ['groups', 'scores', prompt ?? ''] as const,
    queryFn: async () => Object.fromEntries((await data.searchGroups(prompt!, 65)).map((hit) => [hit.item.id, hit.score])),
    enabled: Boolean(prompt && prompt.trim().length > 1),
    staleTime: CATALOGUE_STALE,
  })
}

export function useAddMember(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: AddMemberInput }) => data.addMember(projectId, variantId, input),
    onSuccess: (match) => qc.setQueryData(keys.match(projectId), match),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProjectInput) => data.createProject(input),
    onSuccess: (intent) => qc.setQueryData(keys.project(intent.id), intent),
  })
}

export function useCreateApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateApplicationInput) => data.createApplication(input),
    onSuccess: (app) => qc.setQueryData(keys.application(app.id), app),
  })
}

export function useConfirmTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, sections }: { id: string; sections: TemplateSection[] }) => data.confirmTemplate(id, sections),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.templates }),
  })
}

export function useSaveSection(appId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) => data.saveSection(appId, key, content),
    onSuccess: (app) => qc.setQueryData(keys.application(appId), app),
  })
}

/**
 * Deep research is a one-shot async call — wrap it in useQuery so the result is cached in-memory
 * for the whole session. Reopening the same group/grant/tech panel after it ran once is instant;
 * reloading the page drops the cache (that's the trade-off we picked).
 */
async function runResearch(projectId: string, target: ResearchTarget): Promise<ResearchReport> {
  const controller = new AbortController()
  const op = data.research(projectId, target)
  for await (const event of op(controller.signal)) {
    if (event.type === 'result') return event.data as ResearchReport
    if (event.type === 'error') throw new Error(event.message)
  }
  throw new Error('Deep research skončil bez výsledku.')
}

export function useDeepResearch(projectId: string, target: ResearchTarget) {
  const queryKey = keys.research(projectId, target)
  const qc = useQueryClient()
  // Fire the fetch after the user clicks Spustit, OR immediately if we already have cached data.
  const [started, setStarted] = useState(false)
  const hasCached = qc.getQueryData<ResearchReport>(queryKey) !== undefined
  const query = useQuery({
    queryKey,
    queryFn: () => runResearch(projectId, target),
    enabled: started || hasCached,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
  return { ...query, start: () => setStarted(true) }
}

/** Helpers for components that receive stream results and want to keep the cache in sync. */
export function useCacheWriters() {
  const qc = useQueryClient()
  return {
    setMatch: (projectId: string, match: MatchResult) => qc.setQueryData(keys.match(projectId), match),
    setApplication: (app: ApplicationDraft) => qc.setQueryData(keys.application(app.id), app),
    refreshApplication: (id: string) => qc.invalidateQueries({ queryKey: keys.application(id) }),
  }
}
