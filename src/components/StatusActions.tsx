interface StatusActionsProps {
  current: string;
  transitions: Record<string, string[]>;
  onSelect: (next: string) => void;
  busy?: boolean;
}

export function StatusActions({ current, transitions, onSelect, busy }: StatusActionsProps) {
  const next = transitions[current] ?? [];
  if (next.length === 0) return <span className="text-xs text-ng-disabled">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {next.map((status) => (
        <button
          key={status}
          disabled={busy}
          onClick={() => onSelect(status)}
          className="rounded-md border border-ng-border bg-ng-surface px-2 py-0.5 text-xs font-medium text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent focus-visible:ring-offset-1 disabled:opacity-50"
        >
          → {status.replace("_", " ")}
        </button>
      ))}
    </span>
  );
}
