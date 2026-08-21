"use client";

import { AlertTriangle, Sparkles } from "lucide-react";

import { Badge } from "./ui/badge";

const SOURCE_LABEL: Record<string, string> = {
  minimax: "MiniMax",
  shogo: "Shogo",
  stub: "No key configured",
  error: "Error",
  rule: "Rule-based (no model call)",
};

/**
 * A model recommendation, rendered from named fields.
 *
 * The model answers in a schema rather than prose. Splitting a blob with
 * `<think>` block off the answer, guess where the reasoning ended, truncate
 * the rest to fit. The model now answers against a JSON schema, so each field
 * has somewhere to go and nothing has to be inferred from punctuation.
 *
 * `structured: false` means the provider ignored the schema and returned
 * prose anyway. That is shown as a caveat rather than hidden: the content is
 * still worth reading, but the fields below it were not authored as fields.
 */
export interface ModelRecommendation {
  source?: string;
  action?: string;
  rationale?: string;
  confidence?: number | null;
  risks?: string[];
  structured?: boolean;
  notes?: string;
  error?: string;
}

function asRecommendation(value: unknown): ModelRecommendation | null {
  if (!value || typeof value !== "object") return null;
  const r = value as ModelRecommendation;
  return r.action || r.rationale ? r : null;
}

function confidenceBadge(confidence: number) {
  const pct = Math.round(confidence * 100);
  if (confidence >= 0.8) return { variant: "success" as const, label: `${pct}% confidence` };
  if (confidence >= 0.5) return { variant: "warning" as const, label: `${pct}% confidence` };
  return { variant: "danger" as const, label: `${pct}% confidence` };
}

export function RecommendationCard({ recommendation }: { recommendation: unknown }) {
  const rec = asRecommendation(recommendation);
  if (!rec) return null;

  const source = rec.source ?? "rule";
  const band = typeof rec.confidence === "number" ? confidenceBadge(rec.confidence) : null;

  return (
    <div className="rounded-xl border border-ng-ai-bd bg-ng-surface shadow-ng-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-ng-border/40 px-4 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ng-ai text-white">
          <Sparkles size={13} aria-hidden />
        </span>
        <span className="text-ng-base font-semibold text-ng-primary">Model recommendation</span>
        <Badge variant="ai" size="sm">
          {SOURCE_LABEL[source] ?? source}
        </Badge>
        {band ? (
          <Badge variant={band.variant} size="sm">
            {band.label}
          </Badge>
        ) : null}
        {rec.structured === false ? (
          <Badge variant="muted" size="sm" title="The provider ignored the JSON schema.">
            unstructured
          </Badge>
        ) : null}
      </div>

      <div className="space-y-3 px-4 py-3.5">
        {rec.action ? (
          <p className="text-ng-base font-semibold leading-relaxed text-ng-primary">{rec.action}</p>
        ) : null}

        {rec.rationale ? (
          <p className="whitespace-pre-wrap border-l-2 border-ng-ai pl-3 text-ng-sm leading-relaxed text-ng-secondary">
            {rec.rationale}
          </p>
        ) : null}

        {rec.risks && rec.risks.length > 0 ? (
          <div>
            <p className="text-ng-2xs font-bold uppercase tracking-[.6px] text-ng-secondary">
              Risks the model flagged
            </p>
            <ul className="mt-1.5 space-y-1">
              {rec.risks.map((risk) => (
                <li
                  key={risk}
                  className="flex gap-2 text-ng-sm leading-relaxed text-ng-warning-tx"
                >
                  <AlertTriangle size={12} className="mt-1 shrink-0" aria-hidden />
                  {risk}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {rec.notes ? <p className="text-ng-xs text-ng-secondary">{rec.notes}</p> : null}
        {rec.error ? (
          <p className="rounded-md border border-ng-danger-bd bg-ng-danger-bg px-3 py-2 text-ng-xs text-ng-danger-tx">
            {rec.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
