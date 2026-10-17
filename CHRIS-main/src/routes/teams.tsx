import { useNavigate, useParams } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { NotFound } from "../components/system/Fallbacks";
import { AddMember } from "../components/teams/AddMember";
import { EmailPanel } from "../components/teams/EmailPanel";
import { BestGrantCard, GrantsCard } from "../components/teams/GrantCards";
import { GrantPanel } from "../components/teams/GrantPanel";
import { GroupPanel } from "../components/teams/GroupPanel";
import { StrategySwitch } from "../components/teams/StrategySwitch";
import { TeamCard } from "../components/teams/TeamCard";
import { TechCard } from "../components/teams/TechCard";
import { TechPanel } from "../components/teams/TechPanel";
import { ThinkingLine } from "../components/thinking/ThinkingLine";
import { Button } from "../components/ui/Button";
import { SidePanel } from "../components/ui/SidePanel";
import { data } from "../lib/data";
import type { MatchResult, MemberAction, TeamDiff, TeamVariant } from "../lib/data";
import { useCacheWriters, useMatch, useProject } from "../lib/queries";
import { useStream } from "../lib/stream/useStream";
import { dur, ease, fadeUp } from "../motion/presets";
import { useProjectStore } from "../stores/projectStore";

type Panel =
  | { kind: "group"; id: string }
  | { kind: "email"; id: string }
  | { kind: "tech"; id: string }
  | { kind: "grant"; id: string }
  | null;

export function TeamsPage() {
  const { id } = useParams({ from: "/projekt/$id/tymy" });
  const navigate = useNavigate();
  const project = useProject(id);
  const match = useMatch(id);
  const { setMatch } = useCacheWriters();

  const storedStrategy = useProjectStore(
    (s) => s.strategy[id] ?? "INTELLIGENCE",
  );
  const setStrategy = useProjectStore((s) => s.setStrategy);

  const [panel, setPanel] = useState<Panel>(null);
  const [lastDiff, setLastDiff] = useState<TeamDiff | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  // Team as it was when "Upravit" was pressed; ✕ puts it back (removals, swaps and additions).
  const editSnapshot = useRef<TeamVariant | null>(null);
  // The edit being computed (and kept for "Zkusit znovu" if it fails).
  const [busy, setBusy] = useState<{ groupId: string; action: MemberAction } | null>(null);

  const availableStrategies =
    match.data?.variants.map((variant) => variant.strategy) ?? [];
  const strategy = availableStrategies.includes(storedStrategy)
    ? storedStrategy
    : (availableStrategies[0] ?? "INTELLIGENCE");
  const variant = match.data?.variants.find((v) => v.strategy === strategy);

  const recompute = useStream<TeamDiff>((diff) => {
    if (!match.data) return;
    const next: MatchResult = {
      ...match.data,
      variants: match.data.variants.map((v) =>
        v.strategy === diff.after.strategy ? diff.after : v,
      ),
      groups: { ...match.data.groups, ...diff.groups },
    };
    setMatch(id, next);
    setBusy(null);
    setLastDiff(diff);
    // The diff carries no citations; without the newcomer's source its "why" claims would be
    // dropped. The data source has saved the whole result — take it from there.
    void data.getMatch(id).then((saved) => saved && setMatch(id, saved));
  });

  const rematch = useStream<MatchResult>((result) => {
    setMatch(id, result);
    setLastDiff(null);
  });

  if (project.isError) return <NotFound />;

  if (match.isPending) return null;

  if (!match.data) {
    return (
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center gap-4 px-6 py-24">
        <h1 className="font-display text-display font-medium">
          Týmy ještě nejsou sestavené
        </h1>
        <p className="text-body text-text-muted">
          Nejdřív projděte upřesnění zadání, pak sestavím varianty týmu.
        </p>
        <Button
          href={`/projekt/${id}/upresneni`}
          variant="primary"
          ariaLabel="Pokračovat na upřesnění"
        >
          Pokračovat na upřesnění
        </Button>
      </div>
    );
  }

  const { groups, citations } = match.data;
  const best = variant?.grants[0];
  const otherGrants = variant?.grants.slice(1) ?? [];

  const createApplication = (callId?: string) =>
    void navigate({
      to: "/projekt/$id/prihlaska",
      params: { id },
      search: { grant: callId },
    });

  // ✕ and ↻ act right away, one group at a time; the backend picks a replacement.
  const runEdit = (groupId: string, action: MemberAction) => {
    if (!variant || action === "keep" || recompute.status === "running") return;
    setBusy({ groupId, action });
    void recompute.start(
      data.recompute(id, {
        variant_id: variant.id,
        actions: [{ group_id: groupId, action }],
      }),
    );
  };
  const retryEdit = () => busy && runEdit(busy.groupId, busy.action);

  const cancelEdit = async () => {
    const snapshot = editSnapshot.current;
    editSnapshot.current = null;
    if (!snapshot || snapshot === variant) return;
    setMatch(id, await data.restoreVariant(id, snapshot));
    setFresh([]);
    setLastDiff(null);
  };

  const replace = (groupId: string) => runEdit(groupId, "replace");

  const undo = async () => {
    if (!lastDiff) return;
    const restored = await data.revertVariant(id, lastDiff.before.id);
    setMatch(id, restored);
    setLastDiff(null);
  };

  const panelGroup =
    panel?.kind === "group" || panel?.kind === "email"
      ? groups[panel.id]
      : undefined;
  const panelTech =
    panel?.kind === "tech"
      ? variant?.tech.find((t) => t.id === panel.id)
      : undefined;
  const panelGrant =
    panel?.kind === "grant"
      ? variant?.grants.find((g) => g.call.id === panel.id)
      : undefined;

  return (
    <div className="flex-1 bg-canvas-warm">
      <div className="mx-auto w-full max-w-[1280px] px-5 pt-10 pb-24 sm:px-8 sm:pt-14">
        <motion.header
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mb-8 flex flex-wrap items-end justify-between gap-6"
        >
          <div className="min-w-0 flex-1">
            <p className="mb-2 font-mono text-meta tracking-[0.12em] text-text-muted uppercase">
              Výzkumný projekt
            </p>
            {/* Wide, at most two lines; the full wording stays in the tooltip. */}
            <h1
              title={match.data.intent.prompt}
              className="line-clamp-2 max-w-[1100px] font-display text-display font-medium text-balance text-text"
            >
              {match.data.intent.title}
            </h1>
          </div>
        </motion.header>

        <div className="mb-6">
          <StrategySwitch
            value={strategy}
            available={availableStrategies}
            onChange={(s) => setStrategy(id, s)}
          />
        </div>

        {rematch.status === "running" && (
          <div className="mb-6 rounded-card bg-card px-6 py-5">
            <ThinkingLine
              stage={rematch.stage}
              verb={rematch.verb}
              pct={rematch.pct}
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          {variant && (
            <motion.div
              key={variant.strategy}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: dur.base, ease }}
              className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
            >
              <TeamCard
                variant={variant}
                groups={groups}
                busy={recompute.status === "running" ? busy : null}
                lastDiff={lastDiff}
                recompute={recompute}
                onAction={runEdit}
                onOpen={(groupId) => setPanel({ kind: "group", id: groupId })}
                onRetry={retryEdit}
                onUndo={() => void undo()}
                onSearchAgain={() => void rematch.start(data.match(id))}
                fresh={fresh}
                onEditStart={() => {
                  editSnapshot.current = variant;
                }}
                onEditCancel={() => void cancelEdit()}
                addSlot={
                  <AddMember
                    projectId={id}
                    search={match.data.intent.search ?? { query: match.data.intent.prompt, exclude_slugs: [], nodes: [] }}
                    variant={variant}
                    onAdded={(groupId) => setFresh((list) => [...list, groupId])}
                  />
                }
              />
              {/* Grants at their natural height (every grant visible, no scrolling) set the row height;
                  the team card's map takes whatever is left, so both end together. Only if the
                  people alone are taller than the grants does the last grant card stretch. */}
              <div className="flex flex-col gap-5 [&>*:last-child]:flex-1">
                {best && (
                  <BestGrantCard
                    grant={best}
                    onOpen={(callId) => setPanel({ kind: "grant", id: callId })}
                  />
                )}
                <GrantsCard
                  grants={otherGrants}
                  onOpen={(callId) => setPanel({ kind: "grant", id: callId })}
                />
              </div>
              <TechCard
                tech={variant.tech}
                onOpen={(techId) => setPanel({ kind: "tech", id: techId })}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Next step sits at the end of the page, after the team, grants and technologies */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={6}
          className="mt-8 flex flex-wrap items-center justify-end gap-4"
        >
          <p className="text-small text-text-muted">
            Tým je připravený? Přihlášku poskládám z vybrané varianty.
          </p>
          <Button
            type="button"
            variant="dark"
            size="lg"
            ariaLabel="Vytvořit přihlášku"
            onClick={() => createApplication(best?.call.id)}
          >
            Vytvořit přihlášku
          </Button>
        </motion.div>
      </div>

      <SidePanel
        open={panel !== null}
        onOpenChange={(open) => !open && setPanel(null)}
        title={
          panel?.kind === "email"
            ? "E-mail"
            : panel?.kind === "tech"
              ? "Technologie"
              : panel?.kind === "grant"
                ? "Grant"
                : "Profil skupiny"
        }
      >
        {panel?.kind === "group" && panelGroup && (
          <GroupPanel
            projectId={id}
            group={panelGroup}
            member={variant?.members.find((m) => m.group_id === panelGroup.id)}
            citations={citations}
            onEmail={() => setPanel({ kind: "email", id: panelGroup.id })}
            onReplace={
              variant?.members.some((m) => m.group_id === panelGroup.id)
                ? () => {
                    replace(panelGroup.id);
                    setPanel(null);
                  }
                : undefined
            }
          />
        )}
        {panel?.kind === "email" && panelGroup && (
          <EmailPanel
            projectId={id}
            group={panelGroup}
            onBack={() => setPanel({ kind: "group", id: panelGroup.id })}
          />
        )}
        {panel?.kind === "tech" && panelTech && (
          <TechPanel
            projectId={id}
            tech={panelTech}
            groups={groups}
            onEmail={(groupId) => setPanel({ kind: "email", id: groupId })}
          />
        )}
        {panel?.kind === "grant" && panelGrant && (
          <GrantPanel projectId={id} grant={panelGrant} />
        )}
      </SidePanel>
    </div>
  );
}
