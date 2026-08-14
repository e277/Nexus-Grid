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
        "rounded-[10px] border p-4",
        partial
          ? "border-ng-info-bd bg-ng-info-bg"
          : "border-ng-warning-bd bg-ng-warning-bg"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          size={15}
          className={cn("shrink-0", partial ? "text-ng-info-tx" : "text-ng-warning-tx")}
          aria-hidden
        />
        <h2
          className={cn(
            "text-ng-base font-semibold",
            partial ? "text-ng-info-tx" : "text-ng-warning-tx"
          )}
        >
          {partial ? "Partly covered" : "Not covered"}
        </h2>
      </div>

      <dl className="mt-2.5 space-y-2">
        {covered ? (
          <div>
            <dt className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
              On this page
            </dt>
            <dd className="mt-0.5 max-w-4xl text-ng-sm leading-relaxed text-ng-primary">
              {covered}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
            Not here
          </dt>
          <dd className="mt-0.5 max-w-4xl text-ng-sm leading-relaxed text-ng-primary">
            {missing}
          </dd>
        </div>
        <div>
          <dt className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
            What it would take
          </dt>
          <dd className="mt-0.5 max-w-4xl text-ng-sm leading-relaxed text-ng-secondary">
            {requires}
          </dd>
        </div>
      </dl>

      {children}
    </section>
  );
}
