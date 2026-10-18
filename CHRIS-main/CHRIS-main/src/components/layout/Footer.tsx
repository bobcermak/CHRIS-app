import { Link } from '@tanstack/react-router'
import { AI_NOTICE, PROTOTYPE_NOTICE } from '../../lib/site'
import { GROW_UNDERLINE } from '../ui/linkStyles'
import { Reveal } from '../ui/Reveal'

/** Small legal footer: AI transparency notice, prototype disclaimer, legal links. */
export function Footer() {
  return (
    <footer className="no-print relative px-5 py-5 text-small text-text-muted sm:px-7">
      {/* The top rule draws itself from the left when the footer comes into view */}
      <Reveal kind="line" className="absolute inset-x-0 top-0 h-px bg-line" />
      <div className="mx-auto flex max-w-[1280px] flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <p className="max-w-[96ch]">
          {AI_NOTICE} {PROTOTYPE_NOTICE}
        </p>
        <nav aria-label="Právní informace">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            <li>
              <Link to="/o-projektu" className={`${GROW_UNDERLINE} hover:text-text`}>
                O projektu
              </Link>
            </li>
            <li>
              <Link to="/ochrana-udaju" className={`${GROW_UNDERLINE} hover:text-text`}>
                Ochrana údajů
              </Link>
            </li>
            <li>
              <Link to="/pristupnost" className={`${GROW_UNDERLINE} hover:text-text`}>
                Přístupnost
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
