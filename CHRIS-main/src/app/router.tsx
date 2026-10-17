import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { AppShell } from '../components/layout/AppShell'
import { ErrorState, NotFound } from '../components/system/Fallbacks'
import { HomePage } from '../routes/index'

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: NotFound,
  errorComponent: ErrorState,
})

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })

const projectRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projekt/$id' })

const clarifyRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/upresneni',
  component: lazyRouteComponent(() => import('../routes/clarify'), 'ClarifyPage'),
})

const teamsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/tymy',
  component: lazyRouteComponent(() => import('../routes/teams'), 'TeamsPage'),
})

const applicationRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/prihlaska',
  validateSearch: (search: Record<string, unknown>): { grant?: string } => ({
    grant: typeof search.grant === 'string' ? search.grant : undefined,
  }),
  component: lazyRouteComponent(() => import('../routes/application'), 'ApplicationPage'),
})

const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/katalog',
  validateSearch: (search: Record<string, unknown>): { tab?: 'skupiny' | 'granty' } => ({
    tab: search.tab === 'granty' ? 'granty' : search.tab === 'skupiny' ? 'skupiny' : undefined,
  }),
  component: lazyRouteComponent(() => import('../routes/catalog'), 'CatalogPage'),
})

const legalPage =(name: 'AboutPage' | 'PrivacyPage' | 'AccessibilityPage') =>
  lazyRouteComponent(() => import('../routes/legal'), name)

const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: '/o-projektu', component: legalPage('AboutPage') })
const privacyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/ochrana-udaju', component: legalPage('PrivacyPage') })
const accessibilityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pristupnost', component: legalPage('AccessibilityPage') })

const routeTree = rootRoute.addChildren([
  indexRoute,
  catalogRoute,
  aboutRoute,
  privacyRoute,
  accessibilityRoute,
  projectRoute.addChildren([clarifyRoute, teamsRoute, applicationRoute]),
])

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL === '/' ? '/' : import.meta.env.BASE_URL.replace(/\/$/, ''),
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
