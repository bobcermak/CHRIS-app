import { Link } from '@tanstack/react-router'
import logo from '../../assets/brand/logo.svg'

/** Brand logo (ch.ris wordmark, ARCHITECTURE §11.4) linking home. */
export function Wordmark() {
  return (
    <Link to="/" className="inline-flex shrink-0 items-center rounded-md transition-opacity hover:opacity-80">
      <img src={logo} alt="CHRIS – úvod" width={82} height={28} className="h-7 w-auto" />
    </Link>
  )
}
