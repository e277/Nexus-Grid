"use client";

import { Send } from "lucide-react";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

const STATUS_COPY: Record<
  string,
  { label: string; tone: "success" | "warning" | "danger" | "muted" }
> = {
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "muted" },
};

const TONE_CARD: Record<"success" | "warning" | "danger" | "muted", string> = {
  success: "border-ng-success-bd/70 bg-gradient-to-br from-ng-success-bg to-ng-surface",
  warning: "border-ng-warning-bd/70 bg-gradient-to-br from-ng-warning-bg to-ng-surface",
  danger: "border-ng-danger-bd/70 bg-gradient-to-br from-ng-danger-bg to-ng-surface",
  muted: "border-ng-border bg-ng-surface",
};

/**
 * What happened when the last completed plan tried to reach an operator.
 *
 * Tied to one actual dispatch attempt (the `execute` node's own
 * `dispatch_status`/`dispatch_detail`), not a standing "is the gateway
 * configured" check — before any plan has gone through execute there is
 * nothing to report yet, so the caller renders nothing rather than this
 * panel showing a generic, always-on "Ready" state no plan has earned.
 */
export function DispatchPanel({
  gapLabel,
  status,
  target,
  detail,
}: {
  /** Which plan this outcome belongs to, e.g. "Jamaica · Rice". */
  gapLabel: string;
  status: string;
  target?: string;
  detail?: string;
}) {
  const copy = STATUS_COPY[status] ?? { label: status, tone: "muted" as const };

  return (
    <Card className={cn("p-4", TONE_CARD[copy.tone])}>
      <div className="flex flex-wrap items-center gap-2">
        <Send size={14} className="shrink-0 text-ng-secondary" aria-hidden />
        <h3 className="text-ng-base font-semibold text-ng-primary">Plan delivery</h3>
        <Badge variant={copy.tone} size="sm">
          {copy.label}
        </Badge>
        <span className="text-ng-xs text-ng-secondary">
          {gapLabel}
          {target ? (
            <>
              {" "}
              · session <span className="font-mono text-ng-primary">{target}</span>
            </>
          ) : null}
        </span>
      </div>

      {detail ? (
        <p className="mt-2 max-w-3xl text-ng-sm leading-relaxed text-ng-secondary">{detail}</p>
      ) : null}
    </Card>
  );
}
