import { useState } from "react";

const SOURCE_LABEL: Record<string, string> = {
  minimax: "MiniMax",
  stub: "Stub (no key configured)",
  error: "Error",
  rule: "Rule-based (no LLM call)",
};

function renderBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ng-primary">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function splitThink(text: string): { think: string | null; answer: string } {
  const match = text.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)/i);
  if (match) return { think: match[1].trim(), answer: match[2].trim() };
  return { think: null, answer: text.trim() };
}

/** Readable display for a `recommend` node's raw LLM output — separates
 * reasoning from the answer, renders light markdown, labels the source. */
export function RecommendationCard({ recommendation }: { recommendation: unknown }) {
  const [showReasoning, setShowReasoning] = useState(false);

  let source = "rule";
  let text = "";

  if (recommendation && typeof recommendation === "object") {
    const r = recommendation as Record<string, unknown>;
    source = typeof r.source === "string" ? r.source : "rule";
    text = typeof r.recommendation === "string" ? r.recommendation : "";
  } else if (typeof recommendation === "string") {
    text = recommendation;
  }

  if (!text) return null;

  const { think, answer } = splitThink(text);

  return (
    <div className="rounded-[10px] border border-ng-border bg-ng-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ng-accent text-white">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 1L7.2 4.3L10.5 5.5L7.2 6.7L6 10L4.8 6.7L1.5 5.5L4.8 4.3L6 1Z" fill="currentColor" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-ng-primary">AI Recommendation</span>
        </div>
        <span className="rounded-full border border-ng-border bg-ng-well px-2 py-0.5 text-ng-2xs font-semibold text-ng-secondary">
          {SOURCE_LABEL[source] ?? source}
        </span>
      </div>

      {think ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowReasoning((v) => !v)}
            className="text-ng-xs font-medium text-ng-accent hover:underline"
          >
            {showReasoning ? "Hide reasoning" : "Show reasoning"}
          </button>
          {showReasoning ? (
            <p className="mt-2 whitespace-pre-wrap rounded-md bg-ng-well px-3 py-2 text-ng-xs leading-relaxed text-ng-secondary">
              {think}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ng-primary">{renderBold(answer)}</p>
    </div>
  );
}
