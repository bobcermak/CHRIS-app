import { motion } from "motion/react";
import type { GrantMatch } from "../../lib/data";
import { cn } from "../../lib/utils/cn";
import { formatDate, toPercent } from "../../lib/utils/format";
import { fadeUp } from "../../motion/presets";
import { Card, CardHeader } from "../ui/Card";
import { ExternalArrow } from "../ui/ExternalIconLink";
import { Gauge } from "../ui/Gauge";

// Same hover as the other clickable cards and tiles (catalog cards, TechCard): the fill darkens to panel.
const CARD_HOVER =
  "transition-colors duration-(--dur-hover) ease-(--ease-out) hover:bg-panel has-[a:focus-visible]:bg-panel";

// The link's name is its visible text (WCAG 2.5.3); only the new-window hint is screen-reader text.
const NewWindow = () => <span className="sr-only"> (web grantu, otevře se v novém okně)</span>;

interface BestGrantCardProps {
  grant: GrantMatch;
  /** When set, clicking the card opens the panel; otherwise it links straight to the grant's web. */
  onOpen?: (callId: string) => void;
}

/** Best grant as an orange half-circle gauge (prototype v5). No amounts, no "in X days". */
export function BestGrantCard({ grant, onOpen }: BestGrantCardProps) {
  const href = grant.call.url || undefined;
  const clickable = Boolean(onOpen || href);
  return (
    <Card
      aria-labelledby="best-grant-title"
      reveal="mount"
      className={cn("group/link relative flex flex-col", clickable && CARD_HOVER)}
      delay={0.06}
    >
      <CardHeader
        id="best-grant-title"
        title="Nejlepší grant"
        aside={
          <span className="flex items-center gap-2">
            {grant.call.provider}
            {!onOpen && href && <ExternalArrow />}
          </span>
        }
      />
      <div className="px-4 pt-2">
        <Gauge value={grant.fit} />
      </div>
      <p className="mt-5 text-center text-body text-text">
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(grant.call.id)}
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-orange-500"
            aria-label={`Otevřít detail grantu ${grant.call.name}`}
          >
            {grant.call.name}
          </button>
        ) : href ? (
          // Stretched link: its click area covers the whole card.
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-orange-500"
          >
            {grant.call.name}
            <NewWindow />
          </a>
        ) : (
          grant.call.name
        )}
      </p>
      <p className="mt-1 text-center text-small text-text-muted">
        Uzávěrka {formatDate(grant.call.deadline)}
      </p>
    </Card>
  );
}

function GrantRowBody({ g, linked }: { g: GrantMatch; linked: boolean }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-small font-medium text-text">{g.call.provider}</p>
          <p className="font-display text-small font-medium text-orange-ink tabular">
            {toPercent(g.fit)} %
          </p>
        </div>
        <p className="truncate text-small text-text">{g.call.name}</p>
        <p className="text-[0.75rem] text-text-muted">
          Uzávěrka {formatDate(g.call.deadline)}
        </p>
      </div>
      {linked && <ExternalArrow />}
    </>
  );
}

interface GrantsCardProps {
  grants: GrantMatch[];
  /** When set, clicking a row opens the panel; otherwise it links straight to the grant's web. */
  onOpen?: (callId: string) => void;
}

export function GrantsCard({ grants, onOpen }: GrantsCardProps) {
  if (!grants.length) return null;
  const row = "flex w-full items-center gap-3 rounded-inset bg-inset py-3.5 pr-3 pl-4";
  const interactive =
    "group/link transition-colors duration-(--dur-hover) ease-(--ease-out) hover:bg-panel focus-visible:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500";
  return (
    <Card aria-labelledby="grants-title" delay={0.12} reveal="mount" className="flex flex-col">
      <CardHeader id="grants-title" title="Další granty" />
      <ul className="flex flex-col gap-2.5">
        {grants.map((g, i) => (
          <motion.li
            key={g.call.id}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={i + 3}
          >
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(g.call.id)}
                className={cn(row, interactive, "text-left")}
                aria-label={`Otevřít detail grantu ${g.call.name}`}
              >
                <GrantRowBody g={g} linked={false} />
              </button>
            ) : g.call.url ? (
              /* The whole row links to the grant's website (new tab). */
              <a
                href={g.call.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(row, interactive)}
              >
                <GrantRowBody g={g} linked />
                <NewWindow />
              </a>
            ) : (
              <div className={row}>
                <GrantRowBody g={g} linked={false} />
              </div>
            )}
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}
