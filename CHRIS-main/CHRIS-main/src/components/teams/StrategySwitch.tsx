import { motion } from "motion/react";
import type { KeyboardEvent } from "react";
import type { Strategy } from "../../lib/data";
import { STRATEGIES, STRATEGY_LABEL } from "../../lib/strategy";
import { cn } from "../../lib/utils/cn";
import { spring } from "../../motion/presets";

interface StrategySwitchProps {
  value: Strategy;
  onChange: (s: Strategy) => void;
  available?: readonly Strategy[];
}

/** Variant pills — active one is black with a shared indicator that slides (§10.2 bod 5). */
export function StrategySwitch({
  value,
  onChange,
  available = STRATEGIES,
}: StrategySwitchProps) {
  const enabled = new Set(available);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = STRATEGIES.indexOf(value);
    const direction = e.key === "ArrowRight" ? 1 : STRATEGIES.length - 1;
    const next = STRATEGIES.map(
      (_, offset) =>
        STRATEGIES[(i + direction * (offset + 1)) % STRATEGIES.length],
    ).find((strategy) => enabled.has(strategy));
    if (!next) return;
    onChange(next);
    document.getElementById(`strategy-${next}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Varianta týmu"
      className="flex flex-wrap gap-2"
      onKeyDown={onKey}
    >
      {STRATEGIES.map((s) => {
        const active = s === value;
        const isAvailable = enabled.has(s);
        return (
          <button
            key={s}
            id={`strategy-${s}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls="team-panel"
            tabIndex={active ? 0 : -1}
            disabled={!isAvailable}
            onClick={() => isAvailable && onChange(s)}
            className={cn(
              "relative h-10 rounded-full px-5 text-small font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "text-white"
                : "bg-card text-text hover:bg-inset hover:text-orange-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId="strategy-active"
                className="absolute inset-0 rounded-full bg-charcoal-900"
                transition={spring}
              />
            )}
            <span className="relative">{STRATEGY_LABEL[s]}</span>
          </button>
        );
      })}
    </div>
  );
}
