import { Outlet, useRouterState } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { dur, ease } from '../../motion/presets'
import { Footer } from './Footer'
import { SessionTracker } from './SessionTracker'
import { TopBar } from './TopBar'

/** Shell for all pages. Step changes fade/slide in; the home page has a minimal top bar. */
export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const reduce = useReducedMotion()
  const isHome = pathname === '/'

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-charcoal-900 px-4 py-2 text-small text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Přeskočit na obsah
      </a>
      <SessionTracker />
      <TopBar minimal={isHome} />
      <motion.main
        id="main"
        key={pathname}
        tabIndex={-1}
        className="flex flex-1 flex-col outline-none"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: dur.slow, ease }}
      >
        <Outlet />
      </motion.main>
      <Footer />
    </div>
  )
}
