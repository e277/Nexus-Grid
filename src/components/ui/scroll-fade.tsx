"use client";

import type { ReactNode } from "react";

import { useScrollEdges } from "../../hooks";
import { cn } from "../../lib/utils";

/**
 * A horizontally-scrollable container with edge fades that appear only while
 * there is more content past that edge.
 *
 * A plain `overflow-x-auto` div gives no cue on a touch device, which renders
 * no scrollbar at all — a table can end mid-column and nothing on screen
 * says so. `fadeFrom` names the token this container's own background
 * resolves to (`ng-surface` for a raised card, `ng-bg` for a flush/supporting
 * one), so the fade blends into the same surface it's covering rather than
 * showing a seam.
 */
export function ScrollFade({
  className,
  fadeFrom = "ng-surface",
  children,
}: {
  className?: string;
  fadeFrom?: "ng-surface" | "ng-bg";
  children: ReactNode;
}) {
  const { ref, atStart, atEnd } = useScrollEdges<HTMLDivElement>();

  return (
    <div className="relative">
      <div ref={ref} className={className}>
        {children}
      </div>
      {!atStart ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-20 w-8 bg-gradient-to-r to-transparent",
            fadeFrom === "ng-bg" ? "from-ng-bg" : "from-ng-surface"
          )}
        />
      ) : null}
      {!atEnd ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l to-transparent",
            fadeFrom === "ng-bg" ? "from-ng-bg" : "from-ng-surface"
          )}
        />
      ) : null}
    </div>
  );
}
