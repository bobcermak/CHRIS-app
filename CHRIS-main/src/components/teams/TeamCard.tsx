import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  PencilSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { byMatch } from "../../lib/data";
import type {
  Group,
  MemberAction,
  TeamDiff,
  TeamVariant,
} from "../../lib/data";
import type { StreamState } from "../../lib/stream/useStream";
import { STRATEGY_HINT } from "../../lib/strategy";
import { formatDelta, plural } from "../../lib/utils/format";
import { collapse, easeOut, easeSlow, fadeUp } from "../../motion/presets";
import { ThinkingLine } from "../thinking/ThinkingLine";
import { ErrorNote } from "../system/ErrorNote";
import { Button } from "../ui/Button";
import { Card, CardHeader, Inset } from "../ui/Card";
import { cn } from "../../lib/utils/cn";
import { GroupRow } from "./GroupRow";
import { TeamSummary } from "./TeamSummary";

// Map row incl. its 20 px top padding: never less than this, so the map cannot fold to nothing.
const MAP_MIN_HEIGHT = 280;

interface TeamCardProps {
  variant: TeamVariant;
  groups: Record<string, Group>;
  /** The edit in progress (↻ / ✕ on one group) — that row shows it until the backend answers. */
  busy?: { groupId: string; action: MemberAction } | null;
  lastDiff: TeamDiff | null;
  recompute: Pick<
    StreamState<TeamDiff>,
    "status" | "stage" | "verb" | "pct" | "error"
  >;
  onAction: (groupId: string, action: MemberAction) => void;
  onOpen: (groupId: string) => void;
  /** Repeat the last edit after it failed. */
  onRetry: () => void;
  onUndo: () => void;
  onSearchAgain: () => void;
  /** "Přidat dalšího člověka" under the list. */
  addSlot?: ReactNode;
  /** Groups just added by hand — marked like recompute additions. */
  fresh?: string[];
  /** Edit mode entered — the page keeps a snapshot of the team. */
  onEditStart?: () => void;
  /** ✕ in edit mode — the page restores that snapshot. */
  onEditCancel?: () => void;
}

/** Team of research groups (no team score, only a plain description — prototype rules). */
export function TeamCard(props: TeamCardProps) {
  const {
    variant,
    groups,
    busy,
    lastDiff,
    recompute,
    onAction,
    onOpen,
    onRetry,
    onUndo,
    onSearchAgain,
    addSlot,
    fresh,
    onEditStart,
    onEditCancel,
  } = props;
  const isRunning = recompute.status === "running";
  const [editing, setEditing] = useState(false);
  const added = new Set([
    ...(lastDiff?.after.id === variant.id ? lastDiff.added : []),
    ...(fresh ?? []),
  ]);
  // Always ranked by match at render time — also teams stored before ranking existed and demo data.
  const members = [...variant.members].sort(byMatch);
  const n = members.length;

  return (
    <Card
      reveal="mount"
      // Stretched to the grant column's height; the summary at the bottom takes the extra room.
      className="flex flex-col"
      aria-labelledby="team-title"
      id="team-panel"
      role="tabpanel"
    >
      <CardHeader
        id="team-title"
        title="Tým"
        aside={
          <span className="flex items-center gap-3">
            <span>
              {n
                ? `${n} ${plural(n, ["výzkumná skupina", "výzkumné skupiny", "výzkumných skupin"])}`
                : STRATEGY_HINT[variant.strategy]}
            </span>
            {/* Edit mode reveals replace / remove per person and adding someone new. */}
            {editing ? (
              <span className="flex items-center gap-2">
                {/* ✕ throws away everything changed since "Upravit" */}
                <Button
                  type="button"
                  variant="icon"
                  ariaLabel="Zrušit úpravy"
                  title="Zrušit úpravy"
                  onClick={() => {
                    onEditCancel?.();
                    setEditing(false);
                  }}
                >
                  <XIcon size={18} aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  circleIcon={CheckIcon}
                  ariaLabel="Hotovo"
                  onClick={() => setEditing(false)}
                >
                  Hotovo
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                ariaLabel="Upravit tým"
                onClick={() => {
                  onEditStart?.();
                  setEditing(true);
                }}
              >
                <PencilSimpleIcon size={18} aria-hidden />
                Upravit
              </Button>
            )}
          </span>
        }
      />

      {variant.summary && (
        <Inset className="mb-4 px-5 py-4">
          <p className="text-body text-charcoal-700">{variant.summary}</p>
        </Inset>
      )}

      {n === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-3 px-1 py-10">
          <p className="font-display text-heading font-medium">
            Žádná skupina nedosahuje požadované shody
          </p>
          <p className="max-w-[46ch] text-body text-text-muted">
            Tým nevybírám za každou cenu. Zkuste upřesnit zadání nebo hledat
            externího partnera mimo NÚVR.
          </p>
          <Button
            type="button"
            variant="primary"
            ariaLabel="Hledat znovu"
            onClick={onSearchAgain}
          >
            Hledat znovu
          </Button>
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col">
          <AnimatePresence initial={false} mode="popLayout">
            {members.map((m, i) => {
              const g = groups[m.group_id];
              if (!g) return null;
              return (
                <GroupRow
                  key={m.group_id}
                  index={i}
                  rank={i + 1}
                  editing={editing}
                  member={m}
                  group={g}
                  action={busy?.groupId === m.group_id ? busy.action : "keep"}
                  isNew={added.has(m.group_id)}
                  onAction={(a) => onAction(m.group_id, a)}
                  onOpen={() => onOpen(m.group_id)}
                />
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <AnimatePresence initial={false}>
        {(editing || n === 0) && addSlot && (
          <motion.div
            key="add"
            variants={collapse}
            initial="closed"
            animate="open"
            exit="closed"
            className="overflow-hidden"
          >
            {addSlot}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unfilled roles — also for an empty team (the AI sizes the team; it may find nobody). */}
      {variant.gaps.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 px-1">
          {variant.gaps.map((gap) => (
            <li
              key={gap.slot_key + gap.label}
              className="flex items-start gap-2.5 text-small text-text"
            >
              <span
                aria-hidden
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gap"
              />
              <span>
                <span className="font-medium">Mezera:</span> {gap.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Right under the people; when the card is stretched to the grant column the summary
          grows into the extra room (centred stats on the grey panel) instead of leaving a gap. */}
      {/* Editing makes room for the choices: the map folds away and comes back on Hotovo / ✕.
          flexGrow folds with the height, otherwise the stretched card would keep its space. */}
      <AnimatePresence initial={false}>
        {n > 0 && !editing && (
          <motion.div
            key="map"
            // The row folds 1fr → 0fr: on wide screens the map fills what the card has left (flex
            // basis 0), on narrow ones it keeps its own minimum height — both collapse the same way.
            // The minimum height keeps the map visible when the grant column is not taller than the
            // people (e.g. Grant-first with few calls): the card grows and the grant column follows.
            initial={{ opacity: 0, flexGrow: 0, paddingTop: 0, minHeight: 0, gridTemplateRows: "0fr" }}
            animate={{ opacity: 1, flexGrow: 1, paddingTop: 20, minHeight: MAP_MIN_HEIGHT, gridTemplateRows: "1fr", transition: easeSlow }}
            exit={{ opacity: 0, flexGrow: 0, paddingTop: 0, minHeight: 0, gridTemplateRows: "0fr", transition: easeOut }}
            className="grid basis-0"
          >
            <div className="flex min-h-0 flex-col overflow-hidden">
              <TeamSummary variant={variant} groups={groups} onOpen={onOpen} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn("pt-4 empty:hidden", n === 0 && "mt-auto")}>
        <AnimatePresence initial={false} mode="wait">
          {isRunning ? (
            <motion.div
              key="running"
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit="exit"
              className="rounded-[20px] bg-inset px-5 py-4"
            >
              <ThinkingLine
                stage={recompute.stage}
                verb={recompute.verb}
                pct={recompute.pct}
              />
            </motion.div>
          ) : lastDiff && lastDiff.after.id === variant.id ? (
            <motion.div
              key="diff"
              variants={fadeUp}
              initial="hidden"
              animate="show"
              exit="exit"
              className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-inset px-5 py-3"
            >
              <p
                className="font-mono text-meta text-text-muted"
                aria-live="polite"
              >
                +{lastDiff.added.length}{" "}
                {plural(lastDiff.added.length, ["nová", "nové", "nových"])} · −
                {lastDiff.removed.length}{" "}
                {plural(lastDiff.removed.length, [
                  "vyřazená",
                  "vyřazené",
                  "vyřazených",
                ])}
                {lastDiff.coverage_delta !== 0 &&
                  ` · Δ shody ${formatDelta(lastDiff.coverage_delta)}`}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                ariaLabel="Vrátit změnu"
                onClick={onUndo}
              >
                <ArrowCounterClockwiseIcon size={16} aria-hidden />
                Vrátit změnu
              </Button>
            </motion.div>
          ) : !editing ? null : (
            <motion.p
              key="legend"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-1 text-small text-text-muted"
            >
              ↻ vyměnit za jinou skupinu · ✕ odebrat z týmu · klik na jméno
              otevře profil
            </motion.p>
          )}
        </AnimatePresence>
        {recompute.status === "error" && (
          <div className="mt-3">
            <ErrorNote message={recompute.error} onRetry={onRetry} />
          </div>
        )}
      </div>
    </Card>
  );
}
