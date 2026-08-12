"use client";

import { ChevronDown, ChevronUp, Pencil, ShieldAlert, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import type { GateDecision } from "../../types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/input";

export interface HeldRecommendation {
  /** Node that produced the held plan. */
  agent: string;
  action: string;
  priority: string;
  target: string;
  strategy: string | null;
  /** 0..1 where the run reported one. */
  confidence: number | null;
  /** The model's own words, kept separate from the derived plan. */
  reasoning: string | null;
  /** Risks the model named, which are the point of reading before approving. */
  risks: string[];
  modelSource: string | null;
  valueAtStakeUsd: number | null;
}

const PRIORITY_VARIANT: Record<string, "danger" | "warning" | "info" | "muted"> = {
  urgent: "danger",
  high: "warning",
  normal: "info",
  low: "muted",
};

function confidenceBand(value: number): { variant: "success" | "warning" | "danger"; label: string } {
  if (value >= 0.8) return { variant: "success", label: "high confidence" };
  if (value >= 0.5) return { variant: "warning", label: "medium confidence" };
  return { variant: "danger", label: "low confidence" };
}

function usd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  return `$${value.toLocaleString()}`;
}

/**
 * The one point in the run that is not autonomous.
 *
 * Four answers rather than two: approve as planned, approve with an amendment,
 * reject, or escalate because this is not your decision to make. Modify and
 * escalate both carry a note to the graph, which records it against the gate —
 * they are real decisions, not relabelled approvals.
 */
export function ApprovalPanel({
  recommendation,
  onDecide,
  busy,
}: {
  recommendation: HeldRecommendation;
  onDecide: (decision: GateDecision, note: string | null) => void;
  busy: boolean;
}) {
  const [showReasoning, setShowReasoning] = useState(false);
  /** Which note-taking action is open, if any. */
  const [noteFor, setNoteFor] = useState<"modified" | "escalated" | null>(null);
  const [note, setNote] = useState("");

  const band =
    recommendation.confidence !== null ? confidenceBand(recommendation.confidence) : null;

  function submitNote() {
    if (!noteFor) return;
    onDecide(noteFor, note.trim() || null);
    setNoteFor(null);
    setNote("");
  }

  return (
    <div className="rounded-[10px] border border-ng-warning-bd bg-ng-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-ng-border px-4 py-3">
        <Badge variant={PRIORITY_VARIANT[recommendation.priority] ?? "muted"}>
          {recommendation.priority} priority
        </Badge>
        <Badge variant="muted" className="font-mono">
          {recommendation.agent}
        </Badge>
        {band ? (
          <Badge variant={band.variant}>
            {Math.round((recommendation.confidence ?? 0) * 100)}% · {band.label}
          </Badge>
        ) : null}
        {recommendation.modelSource ? (
          <Badge variant="ai">{recommendation.modelSource}</Badge>
        ) : null}
        {recommendation.valueAtStakeUsd ? (
          <span className="ml-auto text-ng-xs tabular-nums text-ng-secondary">
            {usd(recommendation.valueAtStakeUsd)} at stake
          </span>
        ) : null}
      </div>

      <div className="space-y-3 px-4 py-3.5">
        <div>
          <p className="text-ng-base font-semibold leading-relaxed text-ng-primary">
            {recommendation.action.replace(/_/g, " ")}
          </p>
          <p className="mt-0.5 text-ng-sm text-ng-secondary">
            Directed at {recommendation.target}
          </p>
        </div>

        {recommendation.strategy ? (
          <p className="border-l-2 border-ng-accent pl-3 text-ng-base leading-relaxed text-ng-primary">
            {recommendation.strategy}
          </p>
        ) : null}

        {/* Risks sit above the buttons, unfolded. A named risk is the whole
            reason a human is standing here, so it must not be behind a
            disclosure the approver can skip. */}
        {recommendation.risks.length > 0 ? (
          <div className="rounded-md border border-ng-warning-bd bg-ng-warning-bg px-3 py-2">
            <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-warning-tx">
              Risks the model flagged
            </p>
            <ul className="mt-1 space-y-1">
              {recommendation.risks.map((risk) => (
                <li key={risk} className="flex gap-2 text-ng-sm leading-relaxed text-ng-warning-tx">
                  <ShieldAlert size={12} className="mt-1 shrink-0" aria-hidden />
                  {risk}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {recommendation.reasoning ? (
          <div>
            <button
              type="button"
              onClick={() => setShowReasoning((v) => !v)}
              aria-expanded={showReasoning}
              className="inline-flex items-center gap-1 text-ng-xs font-semibold text-ng-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
            >
              {showReasoning ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showReasoning ? "Hide reasoning" : "Show reasoning"}
            </button>
            {/* Capped and scrollable: this is the model's raw chain of
                thought and runs to hundreds of lines, which would push the
                four decision buttons off the screen. */}
            {showReasoning ? (
              <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border border-ng-ai-bd bg-ng-ai-bg px-3 py-2 text-ng-xs leading-relaxed text-ng-ai-tx">
                {recommendation.reasoning}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Four buttons, four outcomes. Modify and escalate expand inline
            rather than opening a dialog: the plan they amend has to stay on
            screen while the note is written. */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="success"
            size="sm"
            disabled={busy}
            onClick={() => onDecide("approved", null)}
          >
            <ThumbsUp size={13} aria-hidden />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            aria-expanded={noteFor === "modified"}
            onClick={() => {
              setNoteFor((v) => (v === "modified" ? null : "modified"));
              setNote("");
            }}
            className="border-ng-info-bd text-ng-info-tx hover:bg-ng-info-bg"
          >
            <Pencil size={13} aria-hidden />
            Modify
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => onDecide("rejected", null)}
          >
            <ThumbsDown size={13} aria-hidden />
            Reject
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            aria-expanded={noteFor === "escalated"}
            onClick={() => {
              setNoteFor((v) => (v === "escalated" ? null : "escalated"));
              setNote("");
            }}
            className="border-ng-warning-bd text-ng-warning-tx hover:bg-ng-warning-bg"
          >
            <ShieldAlert size={13} aria-hidden />
            Escalate
          </Button>
        </div>

        {noteFor ? (
          <div
            className={cn(
              "rounded-md border p-3",
              noteFor === "modified"
                ? "border-ng-info-bd bg-ng-info-bg"
                : "border-ng-warning-bd bg-ng-warning-bg"
            )}
          >
            <label
              htmlFor="gate-note"
              className={cn(
                "text-ng-xs font-semibold",
                noteFor === "modified" ? "text-ng-info-tx" : "text-ng-warning-tx"
              )}
            >
              {noteFor === "modified"
                ? "What should change before this is actioned?"
                : "Why does this need a higher authority?"}
            </label>
            <Textarea
              id="gate-note"
              rows={3}
              value={note}
              autoFocus
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                noteFor === "modified"
                  ? "e.g. hold the Guyana leg until the storm window closes, run the Belize leg now"
                  : "e.g. commits more than this desk can authorise"
              }
              className="mt-2 bg-ng-surface"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" disabled={busy || !note.trim()} onClick={submitNote}>
                {busy
                  ? "Working…"
                  : noteFor === "modified"
                    ? "Approve with amendment"
                    : "Escalate"}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setNoteFor(null)}>
                Cancel
              </Button>
              <span className="text-ng-2xs text-ng-secondary">
                Recorded against the gate in the audit trail.
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
