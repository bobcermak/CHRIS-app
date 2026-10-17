import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const FONT_CSS = 'https://fonts.googleapis.com'
const FONT_FILES = 'https://fonts.gstatic.com'
// Group leader portraits are public images hosted on the NÚVR website.
const NUVR_IMAGES = 'https://www.nuvr.cz'

function apiOrigin(raw: string | undefined, production: boolean): string {
  if (!raw) {
    if (production) throw new Error('VITE_API_URL must be set for production builds')
    return 'http://localhost:8000'
  }
  const url = new URL(raw)
  if (production && url.protocol !== 'https:') {
    throw new Error(`VITE_API_URL must use https in production, got ${url.protocol}`)
  }
  return url.origin
}

// Emits the Azure Static Web Apps config with security headers; the CSP allows
// network calls only to our own origin and the backend.
function staticWebAppConfig(api: string): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    `style-src 'self' ${FONT_CSS}`,
    `font-src ${FONT_FILES}`,
    `img-src 'self' data: ${NUVR_IMAGES}`,
    `connect-src 'self' ${api}`,
    "manifest-src 'self'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

  const config = {
    navigationFallback: {
      rewrite: '/index.html',
      exclude: ['/assets/*', '/images/*', '/*.webmanifest'],
    },
    mimeTypes: { '.webmanifest': 'application/manifest+json' },
    globalHeaders: {
      'Content-Security-Policy': csp,
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  }

  return {
    name: 'chris:staticwebapp-config',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'staticwebapp.config.json',
        source: JSON.stringify(config, null, 2),
      })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const isDemo = env.VITE_DEMO !== 'false'
  const api = apiOrigin(env.VITE_API_URL, command === 'build' && mode === 'production' && !isDemo)

  return {
    plugins: [react(), tailwindcss(), staticWebAppConfig(api)],
    base: env.VITE_BASE_PATH ?? '/',
    build: { sourcemap: false },
  }
})
