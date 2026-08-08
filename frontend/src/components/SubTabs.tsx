interface SubTab {
  id: string;
  label: string;
}

interface SubTabsProps {
  tabs: SubTab[];
  active: string;
  onChange: (id: string) => void;
}

/** In-page tab row, same active-state language as the sidebar nav. */
export function SubTabs({ tabs, active, onChange }: SubTabsProps) {
  return (
    <div className="mb-5 flex items-center gap-1 border-b border-ng-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`relative px-3 py-2 text-sm font-medium transition-colors ${
            active === t.id
              ? "text-ng-accent"
              : "text-ng-secondary hover:text-ng-primary"
          }`}
        >
          {t.label}
          {active === t.id ? (
            <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ng-accent" />
          ) : null}
        </button>
      ))}
    </div>
  );
}
