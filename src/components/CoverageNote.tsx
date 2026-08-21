"use client";

import { CircleAlert, CircleDashed } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";

/**
 * What this page does and does not cover, stated before anything else on it.
 *
 * A page named after a build area it only partly implements is a claim, and a
 * claim is worth less than the same page with its limits written on it. This
 * says which part is real, which part is missing, and what the missing part
 * would take — so a reader can check the boundary instead of inferring it from
 * an absence.
 */
export function CoverageNote({
  level,
  covered,
  missing,
  requires,
  children,
}: {
  /** `partial` when real work is on the page; `none` when the page is the note. */
  level: "partial" | "none";
  /** What this page genuinely shows. Omitted when there is nothing yet. */
  covered?: ReactNode;
  /** What it does not, named specifically rather than as a general shortfall. */
  missing: ReactNode;
  /** The data that would close it, and why it is not here. */
  requires: ReactNode;
  children?: ReactNode;
}) {
  const partial = level === "partial";
  const Icon = partial ? CircleDashed : CircleAlert;

  return (
    <section
      aria-label="Coverage"
      className={cn(
        "rounded-xl border p-4",
        partial ? "border-ng-info-bd bg-ng-info-bg" : "border-ng-border bg-ng-bg"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          size={15}
          className={cn("shrink-0", partial ? "text-ng-info-tx" : "text-ng-secondary")}
          aria-hidden
        />
        {/* A scope heading rather than a verdict. What is and is not built is
            in the rows below, stated exactly; the heading's job is to say
            that the boundary was chosen, not that something fell short. */}
        <h2
          className={cn(
            "text-ng-base font-semibold",
            partial ? "text-ng-info-tx" : "text-ng-primary"
          )}
        >
          {partial ? "Scope" : "Scope — not implemented"}
        </h2>
      </div>

      <dl className="mt-3 space-y-3">
        {covered ? (
          <div>
            <dt className="text-ng-xs font-bold uppercase tracking-[.6px] text-ng-secondary">
              On this page
            </dt>
            <dd className="mt-1 max-w-4xl text-ng-base leading-relaxed text-ng-primary">
              {covered}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-ng-xs font-bold uppercase tracking-[.6px] text-ng-secondary">
            Not here
          </dt>
          <dd className="mt-1 max-w-4xl text-ng-base leading-relaxed text-ng-primary">
            {missing}
          </dd>
        </div>
        <div>
          <dt className="text-ng-xs font-bold uppercase tracking-[.6px] text-ng-secondary">
            What it would take
          </dt>
          {/* Same weight as "Not here" — this is naming the closing dataset,
              not a footnote, and text-secondary read as literally less
              important than the sentence above it. */}
          <dd className="mt-1 max-w-4xl text-ng-base leading-relaxed text-ng-primary">
            {requires}
          </dd>
        </div>
      </dl>

      {children}
    </section>
  );
}
