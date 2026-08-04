interface StatusActionsProps {
  current: string;
  transitions: Record<string, string[]>;
  onSelect: (next: string) => void;
  busy?: boolean;
}

/** Buttons for the transitions valid from the current status. */
export function StatusActions({
  current,
  transitions,
  onSelect,
  busy,
}: StatusActionsProps) {
  const next = transitions[current] ?? [];
  if (next.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {next.map((status) => (
        <button
          key={status}
          disabled={busy}
          onClick={() => onSelect(status)}
          className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          → {status.replace("_", " ")}
        </button>
      ))}
    </span>
  );
}
