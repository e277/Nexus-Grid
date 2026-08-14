"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "../lib/utils";

/**
 * That this page refreshes itself, and when it last did.
 *
 * The pages re-poll on an interval, so figures change under a reader who was
 * given no reason to expect it. Without this the honest readings are
 * indistinguishable from a stale page — and a number that moves while nobody
 * is looking is worse than one that never moves, because the reader cannot
 * tell which of the two they are looking at.
 *
 * The age counts up every second rather than being written once. A static
 * "updated just now" is a claim that goes quietly false, and this sits beside
 * figures whose freshness is the reason to trust them.
 */
export function LiveIndicator({
  updatedAt,
  refreshing,
  intervalMs,
  className,
}: {
  updatedAt: number | null;
  refreshing: boolean;
  intervalMs: number;
  className?: string;
}) {
  const [, tick] = useState(0);

  // One second is the smallest unit shown, so that is the cadence.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = updatedAt === null ? null : Math.floor((Date.now() - updatedAt) / 1000);
  const every = Math.round(intervalMs / 1000);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-ng-2xs text-ng-secondary",
        className
      )}
      title={
        updatedAt === null
          ? "Waiting for the first response."
          : `Last updated ${new Date(updatedAt).toLocaleTimeString()}. This page re-reads the agents' output every ${every} seconds.`
      }
    >
      {refreshing ? (
        <RefreshCw size={10} className="shrink-0 animate-spin text-ng-accent" aria-hidden />
      ) : (
        <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
          {/* Pulses only when there is something to be live about. A dot that
              animates on a dead feed is a reassurance the page has not
              earned. */}
          {updatedAt !== null ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ng-success opacity-60" />
          ) : null}
          <span
            className={cn(
              "relative inline-flex h-1.5 w-1.5 rounded-full",
              updatedAt === null ? "bg-ng-muted-bd" : "bg-ng-success"
            )}
          />
        </span>
      )}
      <span className="font-semibold uppercase tracking-[.6px]">
        {refreshing ? "Updating" : "Live"}
      </span>
      <span aria-live="off">
        {seconds === null
          ? "· waiting for data"
          : seconds < 2
            ? "· just now"
            : `· ${seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`} ago`}
      </span>
      <span className="hidden sm:inline">· every {every}s</span>
    </span>
  );
}
