import { apiSource } from './api/apiSource'
import { demoSource } from './demo/demoSource'
import type { DataSource } from './source'

/** Demo data unless VITE_DEMO is explicitly "false" (backend connected). */
export const isDemo = import.meta.env.VITE_DEMO !== 'false'

export const data: DataSource = isDemo ? demoSource : apiSource

export type * from './contract'
export type { ApplicationPdfInput, CopilotInput, CreateApplicationInput, DataSource, StreamOp } from './source'
export { byMatch } from './team'
export type { AddMemberInput } from './team'
