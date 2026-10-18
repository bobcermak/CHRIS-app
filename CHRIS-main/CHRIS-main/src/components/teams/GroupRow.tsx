import { ArrowsClockwiseIcon, XIcon, type Icon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { Group, Member, MemberAction } from "../../lib/data";
import { cn } from "../../lib/utils/cn";
import { dur, ease, spring } from "../../motion/presets";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Percent } from "../ui/Percent";
import { Tag } from "../ui/Tag";

interface GroupRowProps {
  member: Member;
  group: Group;
  action: MemberAction;
  isNew?: boolean;
  index: number;
  /** 1-based place in the team ranked by match. */
  rank: number;
  /** Replace / remove controls appear only in the team's edit mode. */
  editing: boolean;
  onAction: (action: MemberAction) => void;
  onOpen: () => void;
}

const ACTIONS: { action: MemberAction; label: string; Icon: Icon }[] = [
  { action: "replace", label: "Vyměnit za jinou skupinu", Icon: ArrowsClockwiseIcon },
  { action: "remove", label: "Odebrat z týmu", Icon: XIcon },
];

/** One group in the team: leader + institution, role, % match, keep / replace / remove. */
export function GroupRow({
  member,
  group,
  action,
  isNew,
  index,
  rank,
  editing,
  onAction,
  onOpen,
}: GroupRowProps) {
  const reduce = useReducedMotion();
  const [roleOpen, setRoleOpen] = useState(false);
  const removed = action === "remove";
  const replacing = action === "replace";

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={
        reduce
          ? { opacity: 0 }
          : { opacity: 0, x: -24, transition: { duration: dur.base, ease } }
      }
      transition={{ duration: dur.base, ease, delay: index * 0.04 }}
      className="relative"
    >
      <div
        className={cn(
          // Hover/new use rings, not fills: orange % must keep 3:1 on white.
          "group/row relative flex items-center gap-4 rounded-[20px] px-3 py-3.5 transition-[box-shadow,opacity] sm:px-4",
          "hover:shadow-[inset_0_0_0_1px_var(--line-strong)]",
          removed && "opacity-45",
          isNew && "shadow-[inset_3px_0_0_0_var(--orange-500)]",
        )}
      >
        {/* Rank in the team (ranked by match) */}
        <span
          aria-label={`${rank}. místo`}
          className="w-5 shrink-0 text-right font-mono text-meta text-text-muted tabular-nums"
        >
          {String(rank).padStart(2, "0")}
        </span>
        <motion.span
          layoutId={`avatar-${group.id}`}
          transition={spring}
          className="inline-flex shrink-0 rounded-full"
        >
          <Avatar
            name={group.pi_name}
            src={group.photo_url}
            className="transition-colors group-hover/row:bg-orange-50 group-hover/row:text-orange-ink"
          />
        </motion.span>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block max-w-full truncate text-left text-body font-medium text-text after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-[20px] focus-visible:after:outline-2 focus-visible:after:outline-orange-500"
          >
            <span
              className={cn(removed && "line-through decoration-charcoal-300")}
            >
              {group.pi_name}
            </span>
            <span className="sr-only">, otevřít profil skupiny</span>
          </button>
          <p className="truncate text-small text-text-muted">
            {[
              group.institution,
              group.department,
              group.size ? `${group.size} lidí` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* Long roles end in "…"; a click shows the whole text (above the row's profile link). */}
            <button
              type="button"
              aria-expanded={roleOpen}
              title={roleOpen ? undefined : member.role}
              onClick={() => setRoleOpen((o) => !o)}
              className={cn(
                "relative z-10 max-w-full rounded-full bg-inset px-2.5 py-0.5 text-left text-[0.75rem] leading-5 text-charcoal-700 transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-orange-500",
                roleOpen ? "rounded-[12px] whitespace-normal" : "truncate",
              )}
            >
              {member.role}
            </button>
            {isNew && (
              <Tag className="bg-orange-50 text-orange-ink">Nová v týmu</Tag>
            )}
            {replacing && (
              <Tag className="bg-orange-50 text-orange-ink">K výměně</Tag>
            )}
          </div>
        </div>

        <Percent value={member.total} size="md" className="relative" />

        <AnimatePresence initial={false}>
        {editing && (
        <motion.div
          key="actions"
          role="group"
          aria-label={`Volba pro skupinu ${group.pi_name}`}
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: "auto" }}
          exit={{ opacity: 0, width: 0 }}
          transition={{ duration: dur.base, ease }}
          className="relative z-10 flex items-center gap-1 overflow-hidden"
        >
          {ACTIONS.map(({ action: a, label, Icon }) => {
            const active = action === a;
            return (
              <Button
                key={a}
                type="button"
                variant="icon"
                size="sm"
                ariaLabel={label}
                title={label}
                pressed={active}
                onClick={() => onAction(active ? "keep" : a)}
              >
                <Icon
                  size={16}
                  weight={active ? "fill" : "regular"}
                  aria-hidden
                />
              </Button>
            );
          })}
        </motion.div>
        )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}
