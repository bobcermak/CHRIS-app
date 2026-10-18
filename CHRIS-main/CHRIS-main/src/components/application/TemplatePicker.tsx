import {
  ArrowDownIcon,
  ArrowRightIcon,
  FileArrowUpIcon,
  LinkSimpleIcon,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { data } from "../../lib/data";
import type { ApplicationTemplate, GrantMatch, TemplateResolveInput } from "../../lib/data";
import { useTemplates } from "../../lib/queries";
import { useStream } from "../../lib/stream/useStream";
import { AGENCY_LABEL, templateStatusLabel } from "../../lib/templates";
import { cn } from "../../lib/utils/cn";
import { formatDate, toPercent } from "../../lib/utils/format";
import { fadeUp } from "../../motion/presets";
import { ErrorNote } from "../system/ErrorNote";
import { ThinkingLine } from "../thinking/ThinkingLine";
import { Button } from "../ui/Button";
import { Card, CardHeader, Inset } from "../ui/Card";
import { ExternalIconLink } from "../ui/ExternalIconLink";

const urlSchema = z.url({ protocol: /^https?$/, message: "Zadejte celou adresu včetně https://" });

const MAX_FILE_MB = 15;
const DOC_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
/** Call documentation the backend can read: PDF or DOCX up to 15 MB (checked there too). */
const fileSchema = z
  .instanceof(File)
  .refine((f) => DOC_TYPES.includes(f.type) || /\.(pdf|docx)$/i.test(f.name), {
    message: "Nahrajte PDF nebo DOCX se zadávací dokumentací.",
  })
  .refine((f) => f.size <= MAX_FILE_MB * 1024 * 1024, {
    message: `Soubor je větší než ${MAX_FILE_MB} MB.`,
  });

/** The team's best-fitting grant that uses a template. */
export interface TemplateFit {
  fit: number;
  callId: string;
  callName: string;
  /** The grant's website. */
  url?: string;
}

interface TemplatePickerProps {
  /** Template of the grant with the highest match. */
  recommendedId?: string;
  /** template id → its best grant, shown on the row so the choice is explained. */
  fits?: Record<string, TemplateFit>;
  /** The grant in the gauge on the teams page — offered first, with or without a template. */
  featured?: GrantMatch;
  busy: boolean;
  /** `callId` = the grant the application is for, when the picker knows it. */
  onPick: (template: ApplicationTemplate, callId?: string) => void;
}

/** Ring filled to the grant's match; the number stays charcoal (orange text fails AA at this size). */
function MatchRing({ value }: { value: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-16 shrink-0 place-items-center" aria-label={`shoda ${toPercent(value)} %`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--orange-500)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} />
      </svg>
      <span aria-hidden className="font-display text-[1.0625rem] leading-none font-medium text-text tabular-nums">
        {toPercent(value)}
        <span className="text-[0.625rem] text-text-muted">%</span>
      </span>
    </span>
  );
}

interface OptionProps {
  highlighted?: boolean;
  badge: string;
  /** Website of the grant the option is for. */
  link?: { href?: string; label: string };
  title: string;
  detail: string;
  steps: string[];
  cta: string;
  busy: boolean;
  onClick: () => void;
}

/** One way to start the application: the highlighted one is warm with a primary button. */
function Option({ highlighted, badge, link, title, detail, steps, cta, busy, onClick }: OptionProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[20px] p-5",
        highlighted ? "bg-orange-50 shadow-[inset_0_0_0_1px_rgb(255_94_31/0.35)]" : "bg-inset",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "w-fit rounded-full px-2.5 py-0.5 font-mono text-[0.6875rem] tracking-[0.08em] uppercase",
            highlighted ? "bg-orange-500 text-white" : "bg-card text-text-muted",
          )}
        >
          {badge}
        </span>
        {link && <ExternalIconLink href={link.href} label={link.label} />}
      </div>
      <div>
        <p className="font-display text-heading font-medium text-text">{title}</p>
        <p className="mt-0.5 text-small text-text-muted">{detail}</p>
      </div>
      <Path steps={steps} />
      <div className="mt-auto pt-1">
        <Button type="button" variant={highlighted ? "primary" : "outline"} ariaLabel={cta} disabled={busy} onClick={onClick}>
          {cta}
        </Button>
      </div>
    </div>
  );
}

/** The way to a draft: one step with a verified template, three with the generic outline. */
function Path({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, i) => (
        <li key={step} className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[0.75rem] text-charcoal-700">
            <span className="grid size-4 place-items-center rounded-full bg-charcoal-900 font-mono text-[0.5625rem] leading-none text-white">
              {i + 1}
            </span>
            {step}
          </span>
          {i < steps.length - 1 && <ArrowRightIcon size={12} className="text-text-muted" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** Scientific verbs while the documentation is read, or a factual error. */
function ResolveProgress({ resolve }: { resolve: ReturnType<typeof useStream<ApplicationTemplate>> }) {
  if (resolve.status === "running") {
    return (
      <Inset className="mt-4 px-5 py-4">
        <ThinkingLine stage={resolve.stage} verb={resolve.verb} pct={resolve.pct} />
      </Inset>
    );
  }
  if (resolve.status === "error") {
    return (
      <div className="mt-4">
        <ErrorNote message={resolve.error} />
      </div>
    );
  }
  return null;
}

/**
 * Step before the document (§9.5): pick a template from the library, or resolve an unknown
 * call from its documentation (URL or PDF) → derived / extracted / generic.
 */
export function TemplatePicker({
  recommendedId,
  fits = {},
  featured,
  busy,
  onPick,
}: TemplatePickerProps) {
  const library = useTemplates();
  // Grant a resolved (generic) template is for — the featured one when started from its card.
  const resolvingFor = useRef<string | undefined>(undefined);
  const resolve = useStream<ApplicationTemplate>((t) => onPick(t, resolvingFor.current));
  const featuredTemplate = featured?.call.template_id
    ? library.data?.find((t) => t.id === featured.call.template_id)
    : undefined;
  // When the featured grant has no template: the best grant that has one, highlighted instead.
  const alternative = !featuredTemplate && recommendedId ? fits[recommendedId] : undefined;
  const altTemplate = alternative ? library.data?.find((t) => t.id === recommendedId) : undefined;

  // "Chci jiný grant": smooth scroll to the other-grant card, then focus its link field.
  const otherCard = useRef<HTMLElement>(null);
  const goToOther = () => {
    const card = otherCard.current;
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => card.querySelector<HTMLInputElement>('input[type="url"]')?.focus({ preventScroll: true }), 450);
  };

  const startFeatured = () => {
    if (featured && featuredTemplate) onPick(featuredTemplate, featured.call.id);
  };
  // A featured grant without a template: its call page is pre-filled in "Jiný grant".
  const featuredDocs = featured && !featured.call.template_id ? featured.call.url : "";
  const [url, setUrl] = useState(featuredDocs);
  const [inputError, setInputError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => {
    const items = library.data ?? [];
    // Recommended first, then by the match of each template's best grant, then the rest.
    return [...items].sort(
      (a, b) =>
        Number(b.id === recommendedId) - Number(a.id === recommendedId) ||
        (fits[b.id]?.fit ?? -1) - (fits[a.id]?.fit ?? -1),
    );
  }, [library.data, recommendedId, fits]);

  // Which card started the resolve — its progress and errors are shown there.
  const [origin, setOrigin] = useState<"featured" | "other">("other");

  const start = (input: TemplateResolveInput, from: "featured" | "other" = "other") => {
    setOrigin(from);
    // The pre-filled link keeps the application tied to the featured grant.
    const callId = "url" in input && featuredDocs && input.url === featuredDocs ? featured?.call.id : undefined;
    resolvingFor.current = callId;
    void resolve.start(data.resolveTemplate(callId ? { ...input, call_id: callId } : input));
  };

  const submitFile = (file: File) => {
    const parsed = fileSchema.safeParse(file);
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? "Soubor nejde načíst.");
      return;
    }
    setInputError(null);
    start({ file: parsed.data });
  };

  const submitUrl = (e: FormEvent) => {
    e.preventDefault();
    const parsed = urlSchema.safeParse(url.trim());
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]?.message ?? "Neplatná adresa.");
      return;
    }
    setInputError(null);
    start({ url: parsed.data });
  };

  return (
    <div className="mx-auto w-full max-w-[880px] px-5 pt-12 pb-24 sm:pt-16">
      <motion.header
        variants={fadeUp}
        initial="hidden"
        animate="show"
        className="mb-8"
      >
        <p className="mb-2 font-mono text-meta tracking-[0.12em] text-text-muted uppercase">
          Přihláška · krok 1
        </p>
        <h1 className="font-display text-display font-medium">
          Vyberte šablonu přihlášky
        </h1>
        <p className="mt-3 max-w-[60ch] text-body text-text-muted">
          Přihlášku připravím pro grant, který má s týmem nejvyšší shodu. Šablona
          určuje sekce, limity a pravidla, podle kterých copilot kontroluje a
          oponuje.
        </p>
      </motion.header>

      {featured && (
        <Card reveal="mount" aria-labelledby="featured-title" className="mb-5">
          {/* First option in the card: a different grant — scrolls down to "Jiný grant". */}
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={goToOther}
              className="group inline-flex items-center gap-1.5 rounded-full bg-inset px-3.5 py-1.5 text-small text-text transition-colors duration-(--dur-hover) ease-(--ease-out) hover:bg-orange-50 hover:text-orange-ink focus-visible:outline-2 focus-visible:outline-orange-500"
            >
              Chci jiný grant
              <ArrowDownIcon size={14} aria-hidden className="transition-transform duration-(--dur-hover) ease-(--ease-out) group-hover:translate-y-0.5" />
            </button>
          </div>

          {/* The grant from the gauge on the teams page */}
          <div className="flex items-center gap-4">
            <MatchRing value={featured.fit} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-meta tracking-[0.12em] text-text-muted uppercase">
                Nejlepší grant týmu
              </p>
              <h2 id="featured-title" className="mt-1 font-display text-title leading-tight font-medium text-text">
                {featured.call.name}
              </h2>
              <p className="mt-0.5 text-small text-text-muted">
                {featured.call.provider}
                {featured.call.deadline ? ` · uzávěrka ${formatDate(featured.call.deadline)}` : ""}
              </p>
            </div>
            <ExternalIconLink href={featured.call.url} label={`Web grantu ${featured.call.name}`} />
          </div>

          {featuredTemplate ? (
            <div className="mt-5">
              <Option
                highlighted
                badge="Ověřená šablona"
                title={featuredTemplate.scheme}
                detail={`${featuredTemplate.sections.length} sekcí · ${featuredTemplate.language === "en" ? "anglicky" : "česky"}`}
                steps={["Psaní podle šablony"]}
                cta="Začít přihlášku"
                busy={busy}
                onClick={startFeatured}
              />
            </div>
          ) : (
            <>
              <p className="mt-5 text-small text-text-muted">
                Pro tuto výzvu ještě nemám ověřenou šablonu. Vyberte si cestu:
              </p>
              <div className={cn("mt-3 grid gap-3", alternative && "sm:grid-cols-2")}>
                {/* Recommended: stay with this grant — the template is read from its call page right
                    away. Without a known page the button scrolls to "Jiný grant" instead. */}
                <Option
                  highlighted
                  badge={`Doporučeno · ${toPercent(featured.fit)} %`}
                  link={{ href: featured.call.url, label: `Web grantu ${featured.call.name}` }}
                  title="Šablona z dokumentace výzvy"
                  detail={
                    featuredDocs
                      ? `Načtu ji ze stránky výzvy ${featured.call.name}; sekce a limity potvrdíte`
                      : `Vložte odkaz na dokumentaci výzvy ${featured.call.name} níže; sekce a limity potvrdíte`
                  }
                  steps={["Načtení dokumentace", "Potvrzení sekcí", "Psaní"]}
                  cta={featuredDocs ? "Načíst šablonu" : "Přejít k odkazu"}
                  busy={busy || resolve.status === "running"}
                  onClick={featuredDocs ? () => start({ url: featuredDocs }, "featured") : goToOther}
                />
                {/* Or switch grant: the verified template of the next best grant */}
                {alternative && altTemplate && (
                  <Option
                    badge={`Jiný grant · ${toPercent(alternative.fit)} %`}
                    link={{ href: alternative.url, label: `Web grantu ${alternative.callName}` }}
                    title={altTemplate.scheme}
                    detail={`Ověřená šablona pro grant ${alternative.callName}`}
                    steps={["Psaní podle šablony"]}
                    cta="Začít s touto šablonou"
                    busy={busy}
                    onClick={() => onPick(altTemplate, alternative.callId)}
                  />
                )}
              </div>
              {origin === "featured" && <ResolveProgress resolve={resolve} />}
            </>
          )}
        </Card>
      )}

      <Card aria-labelledby="library-title">
        <CardHeader
          id="library-title"
          title={featured ? "Nebo jiná šablona z knihovny" : "Knihovna šablon"}
          aside={`${sorted.length} ověřených`}
        />
        <ul className="flex flex-col gap-2">
          {sorted.map((t, i) => {
            const recommended = t.id === recommendedId;
            const fit = fits[t.id];
            return (
              <motion.li
                key={t.id}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={i}
              >
                <button
                  type="button"
                  disabled={busy || resolve.status === "running"}
                  onClick={() => onPick(t, fits[t.id]?.callId)}
                  className={cn(
                    "group flex w-full items-center gap-4 rounded-inset px-5 py-4 text-left transition-colors duration-(--dur-hover) ease-(--ease-out) disabled:opacity-60",
                    recommended
                      ? "bg-orange-50 hover:bg-orange-50/60"
                      : "bg-inset hover:bg-panel",
                  )}
                >
                  <span className="w-28 shrink-0 font-mono text-meta tracking-[0.08em] text-text-muted uppercase">
                    {AGENCY_LABEL[t.agency]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-medium text-text">
                      {t.scheme}
                    </span>
                    <span className="block text-small text-text-muted">
                      {templateStatusLabel(t)} · {t.sections.length} sekcí ·{" "}
                      {t.language === "en" ? "anglicky" : "česky"}
                      {t.document_limits?.max_pages
                        ? ` · max. ${t.document_limits.max_pages} stran`
                        : ""}
                    </span>
                    {fit && (
                      <span className="mt-0.5 block truncate text-small text-text">
                        Grant týmu: {fit.callName}
                      </span>
                    )}
                  </span>
                  {/* Match of this template's best grant with the team, so the user sees why. */}
                  {fit && (
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="font-display text-heading leading-none font-medium text-orange-ink tabular-nums">
                        {toPercent(fit.fit)} %
                      </span>
                      <span className="mt-1 font-mono text-[0.625rem] tracking-[0.08em] text-text-muted uppercase">
                        {recommended ? "Doporučeno" : "shoda grantu"}
                      </span>
                    </span>
                  )}
                  <ArrowRightIcon
                    size={16}
                    className="shrink-0 text-text-muted transition-[translate,color] duration-(--dur-hover) ease-(--ease-out) group-hover:translate-x-1 group-hover:text-orange-500"
                    aria-hidden
                  />
                </button>
              </motion.li>
            );
          })}
        </ul>
      </Card>

      <Card aria-labelledby="other-title" className="mt-5 scroll-mt-28" id="jiny-grant" ref={otherCard}>
        <CardHeader
          id="other-title"
          title="Jiný grant"
          aside="Šablonu odvodím z dokumentace grantu"
        />
        <p className="mb-4 max-w-[62ch] text-small text-text-muted">
          Vložte odkaz na stránku výzvy nebo nahrajte zadávací dokumentaci (PDF
          nebo DOCX, max. {MAX_FILE_MB} MB). Ze stránky projdu i přiložené dokumenty.
          Sekce a limity vytáhnu s odkazem na stranu dokumentace a vy je
          potvrdíte. Když osnovu nenajdu, nabídnu obecnou.
        </p>
        <form onSubmit={submitUrl} className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Odkaz na zadávací dokumentaci</span>
            <LinkSimpleIcon
              size={16}
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… stránka výzvy nebo PDF"
              aria-invalid={Boolean(inputError)}
              aria-describedby={inputError ? "other-error" : undefined}
              className="h-[54px] w-full rounded-full border border-line bg-inset pr-4 pl-11 text-body transition-colors duration-(--dur-hover) ease-(--ease-out) placeholder:text-text-muted hover:border-line-strong focus:border-line-strong focus:bg-card"
            />
          </label>
          <Button
            type="submit"
            variant="outline"
            ariaLabel="Načíst šablonu"
            disabled={resolve.status === "running"}
          >
            Načíst šablonu
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={[".pdf", ".docx", ...DOC_TYPES].join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) submitFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            ariaLabel="Nahrát dokumentaci (PDF nebo DOCX)"
            onClick={() => fileInput.current?.click()}
            disabled={resolve.status === "running"}
          >
            <FileArrowUpIcon size={20} aria-hidden />
            Nahrát dokument
          </Button>
        </form>
        {inputError && (
          <p id="other-error" role="alert" className="mt-2 text-small text-risk">
            {inputError}
          </p>
        )}
        {origin === "other" && <ResolveProgress resolve={resolve} />}
      </Card>
    </div>
  );
}
