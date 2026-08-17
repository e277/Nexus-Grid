"use client";

import { Send } from "lucide-react";

import { cn } from "../../lib/utils";
import type { DispatchReadiness } from "../../types";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

/**
 * Whether an approved plan has anywhere to go.
 *
 * The gate is the point of the whole loop, and a plan approved into a
 * deployment with no delivery channel goes nowhere. This is a standing status
 * beside the gate, so the answer is on screen at the moment of the decision
 * rather than only in a finished run's result. It names the exact variables
 * still unset, not a general complaint that something is unconfigured.
 */
export function DispatchPanel({ dispatch }: { dispatch: DispatchReadiness }) {
  const ready = dispatch.status === "ready";

  return (
    <Card
      className={cn(
        "p-4",
        ready
          ? "border-ng-success-bd/70 bg-gradient-to-br from-ng-success-bg to-ng-surface"
          : "border-ng-warning-bd/70 bg-gradient-to-br from-ng-warning-bg to-ng-surface"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Send size={14} className="shrink-0 text-ng-secondary" aria-hidden />
        <h3 className="text-ng-base font-semibold text-ng-primary">Plan delivery</h3>
        <Badge variant={ready ? "success" : "warning"} size="sm">
          {ready ? "Ready" : "Not configured"}
        </Badge>
        {ready && dispatch.session ? (
          <span className="text-ng-xs text-ng-secondary">
            approved plans go to the OpenClaw dashboard, session{" "}
            <span className="font-mono text-ng-primary">{dispatch.session}</span> on agent{" "}
            <span className="font-mono text-ng-primary">{dispatch.agent_id}</span>
          </span>
        ) : null}
      </div>

      {ready ? (
        <p className="mt-2 max-w-3xl text-ng-sm leading-relaxed text-ng-secondary">
          An approved or amended plan is posted into a running OpenClaw gateway&apos;s dashboard,
          where an operator reads it — it starts no agent run and is sent to no outside channel.
          Rejected and escalated plans are never posted at all: they are decisions not to act.
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-3xl text-ng-sm leading-relaxed text-ng-secondary">
            Approved plans have nowhere to go, so the execute step reports its dispatch as
            simulated rather than claiming a delivery.
          </p>
          {/* Which environment these belong to, because the gateway is a
              separate process and is usually configured somewhere else
              entirely — a container, a service, another host. Setting them
              there instead of here is the obvious wrong turn, and this panel
              is where a reader decides which one to open. */}
          <p className="mt-1.5 max-w-3xl text-ng-sm leading-relaxed text-ng-secondary">
            These belong to <span className="font-medium text-ng-primary">this app</span>, in its
            own <span className="font-mono">.env</span> — not to the gateway, which keeps its own
            configuration and owns the channel itself. They are read once at startup, so restart
            the server after setting one.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {dispatch.missing.map((setting) => (
              <li key={setting.key} className="text-ng-sm leading-snug">
                <span className="font-mono font-semibold text-ng-warning-tx">{setting.key}</span>
                <span className="text-ng-secondary"> — {setting.describes}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
