import { ArrowRightIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { isDemo } from "../../lib/data";
import type { TechResource } from "../../lib/data";
import { fadeUp } from "../../motion/presets";
import { Card, CardHeader } from "../ui/Card";

/** Technologies: just the name and where it can be done (prototype rules). */
export function TechCard({
  tech,
  onOpen,
}: {
  tech: TechResource[];
  onOpen: (id: string) => void;
}) {
  if (!tech.length) return null;
  return (
    <Card aria-labelledby="tech-title" className="lg:col-span-2" delay={0.15} reveal="mount">
      <CardHeader
        id="tech-title"
        title="Technologie"
        aside={isDemo ? "Kliknutím otevřete deep research" : "Infrastruktury, které tým využívá"}
      />
      <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {tech.map((t, i) => (
          <motion.li
            key={t.id}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={i + 3}
          >
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className="group flex h-full w-full flex-col gap-3 rounded-inset bg-inset p-5 text-left transition-colors hover:bg-panel"
            >
              <span className="font-display text-body font-medium text-text">
                {t.name}
              </span>
              <span className="mt-auto flex items-start gap-2 text-small text-text-muted">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange-500 transition-transform group-hover:scale-150"
                />
                {t.where.institution}
                {t.where.node && !t.where.institution.includes(t.where.node)
                  ? `, ${t.where.node}`
                  : ""}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-meta tracking-[0.1em] text-orange-ink uppercase opacity-0 transition-[opacity,translate] -translate-x-1 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
                {isDemo ? "Deep research" : "Detail"} <ArrowRightIcon size={16} aria-hidden />
              </span>
            </button>
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}
