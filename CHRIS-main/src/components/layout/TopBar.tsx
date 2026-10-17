import { PlusIcon } from "@phosphor-icons/react";
import { cn } from "../../lib/utils/cn";
import { Button } from "../ui/Button";
import { Stepper } from "./Stepper";
import { Wordmark } from "./Wordmark";

export function TopBar({ minimal = false }: { minimal?: boolean }) {
  return (
    <header
      className={cn(
        "no-print sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4 px-5 sm:px-7",
        !minimal && "border-b border-line/70 bg-canvas/85 backdrop-blur-md",
      )}
    >
      <Wordmark />
      {!minimal && <Stepper />}
      <div className="flex items-center gap-3">
        {!minimal && (
          <>
            {/* Phones get the round icon button — a text-less pill would look squashed */}
            <Button
              href="/"
              variant="icon"
              ariaLabel="Nový projekt"
              title="Nový projekt"
              className="sm:hidden"
            >
              <PlusIcon size={20} aria-hidden />
            </Button>
            <Button
              href="/"
              variant="primary"
              ariaLabel="Nový projekt"
              circleIcon={PlusIcon}
              className="hidden sm:inline-flex"
            >
              Nový projekt
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
